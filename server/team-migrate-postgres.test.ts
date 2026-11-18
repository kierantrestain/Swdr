import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import handler from '../api/team';
import type { TeamResponse, TeamSignedIn } from '../src/workspace/team-contract';
import { ensureSchema, schemaStatements, teamDatabaseUrl } from './team-migrate';

const databaseUrl = process.env.SWDR_TEST_DATABASE_URL;

test('the team database falls back to the Vercel Postgres variables', () => {
  assert.equal(teamDatabaseUrl({ DATABASE_URL: 'postgres://a', POSTGRES_URL: 'postgres://b' }), 'postgres://a');
  assert.equal(teamDatabaseUrl({ SWDR_TEAM_DATABASE_URL: 'postgres://own', DATABASE_URL: 'postgres://a' }), 'postgres://own');
  assert.equal(teamDatabaseUrl({ POSTGRES_URL: ' postgres://b ' }), 'postgres://b');
  assert.equal(teamDatabaseUrl({ SWDR_TEAM_DATABASE_URL: ' ' }), undefined);
  assert.doesNotMatch(schemaStatements(), /^\s*(BEGIN|COMMIT);\s*$/m);
});

test('a fresh database is migrated on first use, so open sign-up works with only DATABASE_URL set', { skip: !databaseUrl }, async t => {
  const connection = new URL(databaseUrl!);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) && /^\/swdr_test_[a-z0-9_]+$/.test(connection.pathname));
  const database = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });
  t.after(async () => { await database.end(); });
  await database.query('DROP TABLE IF EXISTS swdr_team_login_attempts, swdr_team_invitations, swdr_team_credentials, swdr_team_users, swdr_team_sessions CASCADE');

  // Concurrent cold starts serialise on the advisory lock instead of racing on CREATE TABLE.
  const other = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });
  t.after(async () => { await other.end(); });
  await Promise.all([ensureSchema(database), (async () => {
    const client = await other.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [0x5344_5201]);
      await client.query(schemaStatements());
      await client.query('COMMIT');
    } finally { client.release(); }
  })()]);
  const tables = await database.query<{ name: string }>("SELECT table_name AS name FROM information_schema.tables WHERE table_name LIKE 'swdr_team_%'");
  assert.ok(tables.rows.map(row => row.name).includes('swdr_team_users'));

  process.env.DATABASE_URL = databaseUrl;
  process.env.SWDR_TEAM_SIGNUP = 'open';
  delete process.env.SWDR_TEAM_DATABASE_URL;
  t.after(() => { delete process.env.DATABASE_URL; delete process.env.SWDR_TEAM_SIGNUP; });

  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => await new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const post = async <T>(action: string, body: Record<string, unknown>, cookie?: string) => {
    const response = await fetch(`${origin}/api/team`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', 'x-real-ip': '203.0.113.9', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ ...body, action })
    });
    return { status: response.status, payload: await response.json() as TeamResponse<T>, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };

  const email = `writer-${Date.now()}@accounts.test`;
  const created = await post<TeamSignedIn>('sign-up', { name: 'Fresh Writer', email, password: 'lamp lit through the storm 42' });
  assert.equal(created.status, 200, created.payload.error);
  const session = await post<{ email: string }>('session', {}, created.cookie);
  assert.equal(session.payload.data?.email, email);
});

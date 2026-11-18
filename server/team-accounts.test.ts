import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Pool } from 'pg';
import { createProject } from '../src/workspace/project';
import {
  hashPassword, lockSeconds, newToken, PASSWORD_SCHEME, passwordProblem, readSignupMode, signInRules, TOKEN,
  tokenDigest, verifyPassword
} from './team-auth';
import { episodeScope } from './team-invitations';
import { emailField, TeamFault } from './team-model';
import { readAccounts, runTeamAction } from './team-service';
import type { TeamContext } from './team-service';

type Row = Record<string, unknown>;
interface Call { sql: string; args: unknown[] }

function fakePool(answer: (sql: string, args: unknown[]) => Row[] | undefined) {
  const calls: Call[] = [];
  const query = async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    const rows = answer(sql, args) ?? [];
    return { rows, rowCount: rows.length };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
  return { pool, calls };
}

const invite: TeamContext = { signup: 'invite', address: '203.0.113.9' };
const open: TeamContext = { signup: 'open', address: '203.0.113.9' };
const noAccounts = readAccounts(undefined);
const session = newToken();

test('scrypt hashes use a per-user salt, verify in constant time and reject unknown or weakened records', async () => {
  const first = await hashPassword('correct horse battery');
  const second = await hashPassword('correct horse battery');
  assert.equal(first.scheme, PASSWORD_SCHEME);
  assert.match(first.scheme, /^scrypt:N=32768,r=8,p=1,len=32$/);
  assert.equal(first.salt.length, 16);
  assert.notDeepEqual(first.salt, second.salt);
  assert.notDeepEqual(first.hash, second.hash);
  assert.equal(await verifyPassword('correct horse battery', first), true);
  assert.equal(await verifyPassword('correct horse battery', second), true);
  assert.equal(await verifyPassword('correct horse batterY', first), false);
  assert.equal(await verifyPassword('', first), false);
  // An unknown email still spends the same work on a decoy and fails.
  assert.equal(await verifyPassword('correct horse battery'), false);
  assert.equal(await verifyPassword('correct horse battery', { ...first, scheme: 'scrypt:N=2,r=1,p=1,len=32' }), false);
  assert.equal(await verifyPassword('correct horse battery', { ...first, scheme: 'md5' }), false);
  assert.equal(await verifyPassword('correct horse battery', { ...first, hash: first.hash.subarray(1) }), false);
  // Compatibility forms of the same characters hash identically.
  const composed = await hashPassword('café au lait 2026');
  assert.equal(await verifyPassword('café au lait 2026', composed), true);
});

test('password rules require length and variety and refuse the email or common passwords', () => {
  const email = 'writer@example.test';
  assert.match(passwordProblem('short', email) ?? '', /at least 10/);
  assert.match(passwordProblem('x'.repeat(257), email) ?? '', /at most 256/);
  assert.match(passwordProblem('          ', email) ?? '', /only spaces/);
  assert.match(passwordProblem('abababababab', email) ?? '', /variety/);
  assert.match(passwordProblem(email.toUpperCase(), email) ?? '', /email/);
  assert.match(passwordProblem('Password123', email) ?? '', /too common/);
  assert.match(passwordProblem(undefined, email) ?? '', /Enter a password/);
  assert.equal(passwordProblem('rain on the tin roof', email), undefined);
  assert.equal(passwordProblem('\u{1F3AC}\u{1F3AC} take two, scene 4', email), undefined);
});

test('tokens are 256-bit, unguessable and stored only as digests', () => {
  const tokens = new Set(Array.from({ length: 200 }, newToken));
  assert.equal(tokens.size, 200);
  for (const value of tokens) assert.match(value, TOKEN);
  const value = newToken();
  assert.equal(tokenDigest(value), createHash('sha256').update(value).digest('hex'));
  assert.notEqual(tokenDigest(value), value);
});

test('configuration: invite-only by default, open on request, and a typo fails closed', () => {
  assert.equal(readSignupMode(undefined), 'invite');
  assert.equal(readSignupMode(''), 'invite');
  assert.equal(readSignupMode(' Invite '), 'invite');
  assert.equal(readSignupMode('OPEN'), 'open');
  assert.throws(() => readSignupMode('opne'), (error: unknown) => error instanceof TeamFault && error.status === 503);
  assert.equal(readAccounts(undefined).size, 0);
  assert.equal(readAccounts('').size, 0);
  assert.equal(readAccounts('{}').size, 0);
  assert.throws(() => readAccounts('{"a@b.test":"short"}'), /not configured/);
  assert.throws(() => readAccounts('not json'), /not configured/);
});

test('emails are normalised to one form', () => {
  assert.equal(emailField('  Writer@Example.TEST '), 'writer@example.test');
  assert.equal(emailField('ｗriter@example.test'), 'writer@example.test');
  assert.throws(() => emailField('not-an-address'), /Invalid email/);
});

test('throttling backs off exponentially after the limit and caps at fifteen minutes', () => {
  assert.equal(lockSeconds(4, 5), 0);
  assert.equal(lockSeconds(5, 5), 30);
  assert.equal(lockSeconds(6, 5), 60);
  assert.equal(lockSeconds(8, 5), 240);
  assert.equal(lockSeconds(50, 5), 900);
  const [byEmail, byAddress] = signInRules('writer@example.test', '203.0.113.9');
  assert.match(byEmail.scope, /^email:[a-f0-9]{64}$/);
  assert.match(byAddress.scope, /^ip:[a-f0-9]{64}$/);
  assert.equal(byEmail.scope.includes('writer'), false);
});

test('a locked email is refused before the password is checked', async () => {
  const { pool, calls } = fakePool(sql => sql.includes('FROM swdr_team_login_attempts') ? [{ wait: 120 }] : []);
  await assert.rejects(
    runTeamAction(pool, noAccounts, { action: 'sign-in', email: 'writer@example.test', password: 'whatever it is' }, undefined, invite),
    (error: unknown) => error instanceof TeamFault && error.status === 429 && /2 minutes/.test(error.message)
  );
  assert.equal(calls.some(call => call.sql.includes('swdr_team_credentials')), false);
});

test('a failed password counts against the email and address; success issues a hashed, expiring session', async () => {
  const stored = await hashPassword('rain on the tin roof');
  const { pool, calls } = fakePool(sql => {
    if (sql.includes('FROM swdr_team_credentials')) return [{ name: 'Rae', ...stored }];
    if (sql.includes('RETURNING failures')) return [{ failures: 1 }];
    return [];
  });
  await assert.rejects(
    runTeamAction(pool, noAccounts, { action: 'sign-in', email: 'rae@example.test', password: 'wrong guess here' }, undefined, invite),
    /not accepted/
  );
  assert.equal(calls.filter(call => call.sql.includes('RETURNING failures')).length, 2);
  assert.equal(calls.some(call => call.sql.includes('INSERT INTO swdr_team_sessions')), false);
  calls.length = 0;
  const result = await runTeamAction(pool, noAccounts, { action: 'sign-in', email: 'Rae@Example.test', password: 'rain on the tin roof' }, undefined, invite);
  assert.deepEqual((result.data as { account: unknown }).account, { email: 'rae@example.test', name: 'Rae', method: 'password', hasPassword: true });
  assert.match(result.cookie ?? '', /^swdr_session=[A-Za-z0-9_-]{43}; Max-Age=604800; Path=\/api\/team; Secure; HttpOnly; SameSite=Strict$/);
  const token = /^swdr_session=([^;]+)/.exec(result.cookie ?? '')?.[1] ?? '';
  const insert = calls.find(call => call.sql.includes('INSERT INTO swdr_team_sessions'));
  assert.ok(insert);
  assert.equal(insert.args[0], tokenDigest(token));
  assert.equal(insert.args.includes(token), false);
  assert.match(insert.sql, /make_interval\(secs => \$3\)/);
  assert.equal(insert.args[2], 7 * 24 * 3600);
});

test('sessions: expired or unknown digests, removed keys and deleted accounts are signed out', async () => {
  let row: Row | undefined;
  const { pool, calls } = fakePool(sql => sql.includes('FROM swdr_team_sessions s') ? (row ? [row] : []) : []);
  const accounts = readAccounts(JSON.stringify({ 'keyholder@example.test': 'a'.repeat(64) }));
  const ask = () => runTeamAction(pool, accounts, { action: 'session' }, session, invite);
  await assert.rejects(ask(), /Sign in/);
  assert.match(calls[0].sql, /expires_at > now\(\)/);
  assert.equal(calls[0].args[0], tokenDigest(session));
  await assert.rejects(runTeamAction(pool, accounts, { action: 'session' }, 'not a token', invite), /Sign in/);
  row = { email: 'gone@example.test', method: 'access-key', registered: false, has_password: false };
  await assert.rejects(ask(), /Sign in/);
  row = { email: 'deleted@example.test', method: 'password', registered: false, has_password: false };
  await assert.rejects(ask(), /Sign in/);
  row = { email: 'keyholder@example.test', method: 'access-key', name: null, registered: false, has_password: false };
  assert.deepEqual((await ask()).data, { email: 'keyholder@example.test', name: '', method: 'access-key', hasPassword: false });
  row = { email: 'writer@example.test', method: 'password', name: 'Wren', registered: true, has_password: true };
  assert.deepEqual((await ask()).data, { email: 'writer@example.test', name: 'Wren', method: 'password', hasPassword: true });
  assert.ok(calls.some(call => call.sql.startsWith('UPDATE swdr_team_users SET last_active_at')));
});

test('invite-only sign-up needs an invitation and key-holder emails cannot be claimed', async () => {
  const { pool, calls } = fakePool(() => []);
  const accounts = readAccounts(JSON.stringify({ 'keyholder@example.test': 'a'.repeat(64) }));
  const fields = { action: 'sign-up', name: 'New Writer', email: 'new@example.test', password: 'rain on the tin roof' };
  await assert.rejects(runTeamAction(pool, accounts, fields, undefined, invite), (error: unknown) =>
    error instanceof TeamFault && error.status === 403 && /invite-only/.test(error.message));
  assert.equal(calls.length, 0);
  await assert.rejects(runTeamAction(pool, accounts, { ...fields, password: 'short' }, undefined, open), /at least 10/);
  await assert.rejects(runTeamAction(pool, accounts, { ...fields, name: '  ' }, undefined, open), /Enter your name/);
  await assert.rejects(runTeamAction(pool, accounts, { ...fields, email: 'KeyHolder@example.test' }, undefined, open), /access key/);
});

test('invitations: owner only, existing members are changed instead, and episode scopes must exist', async () => {
  const project = createProject('Scoped series', 'series');
  let role = 'editor';
  let member = false;
  const { pool } = fakePool(sql => {
    if (sql.includes('FROM swdr_team_sessions s')) return [{ email: 'me@example.test', method: 'password', registered: true, has_password: true }];
    if (sql.includes('FOR UPDATE')) return [{ body: project, version: 1 }];
    if (sql.startsWith('SELECT role, episode_ids FROM swdr_team_grants')) return [{ role, episode_ids: null }];
    if (sql.startsWith('SELECT 1 FROM swdr_team_grants')) return member ? [{ '?column?': 1 }] : [];
    return [];
  });
  const ask = (body: Row) => runTeamAction(pool, noAccounts, { projectId: project.id, ...body }, session, invite);
  const invitation = { action: 'invite', email: 'friend@example.test', role: 'editor', episodeIds: null };
  await assert.rejects(ask(invitation), /owner access/);
  await assert.rejects(ask({ action: 'invitations' }), /owner access/);
  await assert.rejects(ask({ action: 'grants' }), /owner access/);
  role = 'owner';
  await assert.rejects(ask({ ...invitation, role: 'producer' }), /Invalid project role/);
  await assert.rejects(ask({ ...invitation, episodeIds: ['missing'] }), /episode is missing/);
  await assert.rejects(ask({ ...invitation, episodeIds: [] }), /Select one or more episodes/);
  await assert.rejects(ask({ ...invitation, email: 'me@example.test' }), /already have access/);
  await assert.rejects(ask({ ...invitation, days: 90 }), /invitation duration/);
  // Direct grants cannot add strangers: they must hold an invitation link.
  await assert.rejects(ask({ action: 'grant', email: 'stranger@example.test', role: 'viewer', episodeIds: null }), /Invite them with a link/);
  member = true;
  await assert.rejects(ask(invitation), /already has access/);
  assert.deepEqual(episodeScope(project, null), null);
  assert.deepEqual(episodeScope(project, [project.episodes[0].id, project.episodes[0].id]), [project.episodes[0].id]);
});

test('an invitation can only be accepted by the invited email, once, before it expires', async () => {
  const token = newToken();
  let row: Row = {
    id: 'inv1', project_id: null, email: 'invited@example.test', role: null, episode_ids: null, invited_by: 'owner@example.test',
    created_at: new Date(), expires_at: new Date(Date.now() + 60000), accepted_at: null, revoked_at: null
  };
  const { pool, calls } = fakePool((sql, args) => {
    if (sql.includes('FROM swdr_team_sessions s')) return [{ email: 'someone@example.test', method: 'password', registered: true, has_password: true }];
    if (sql.includes('FROM swdr_team_invitations WHERE digest')) return args[0] === tokenDigest(token) ? [row] : [];
    return [];
  });
  const accept = (value = token) => runTeamAction(pool, noAccounts, { action: 'accept-invite', token: value }, session, invite);
  await assert.rejects(accept(newToken()), (error: unknown) => error instanceof TeamFault && error.status === 404);
  await assert.rejects(accept('short'), (error: unknown) => error instanceof TeamFault && error.status === 404);
  await assert.rejects(accept(), /sent to invited@example.test/);
  assert.equal(calls.some(call => call.sql.startsWith('UPDATE swdr_team_invitations SET accepted_at')), false);
  row = { ...row, expires_at: new Date(Date.now() - 1000) };
  await assert.rejects(accept(), (error: unknown) => error instanceof TeamFault && error.status === 410 && /expired/.test(error.message));
  row = { ...row, expires_at: new Date(Date.now() + 60000), accepted_at: new Date() };
  await assert.rejects(accept(), /already been used/);
  row = { ...row, accepted_at: null, revoked_at: new Date() };
  await assert.rejects(accept(), (error: unknown) => error instanceof TeamFault && error.status === 404);
});

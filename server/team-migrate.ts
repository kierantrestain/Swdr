import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** A fixed key so concurrent cold starts apply the schema one at a time. */
const LOCK = 0x5344_5201;

let pending: Promise<void> | undefined;

/** The idempotent schema without its own BEGIN/COMMIT, so it can run inside a locked transaction. */
function schemaFile(): string {
  // Next to this module in a checkout; under the function root on Vercel (included through vercel.json).
  const candidates = [fileURLToPath(new URL('./team-schema.sql', import.meta.url)), join(process.cwd(), 'server', 'team-schema.sql')];
  const found = candidates.find(path => existsSync(path));
  if (!found) throw new Error('The team schema file is missing from this deployment.');
  return readFileSync(found, 'utf8');
}

export function schemaStatements(sql = schemaFile()): string {
  return sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');
}

/**
 * Creates or upgrades the team tables once per server instance. The schema only adds what is missing,
 * so a fresh database is ready on first sign-up and an existing one is upgraded in place.
 */
export function ensureSchema(pool: Pool): Promise<void> {
  pending ??= (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
      await client.query(schemaStatements());
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  })().catch(error => {
    pending = undefined;
    throw error;
  });
  return pending;
}

/** The team database: the dedicated variable first, then the connection a Vercel Postgres integration provides. */
export function teamDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return [env.SWDR_TEAM_DATABASE_URL, env.DATABASE_URL, env.POSTGRES_URL].find(value => value?.trim())?.trim();
}

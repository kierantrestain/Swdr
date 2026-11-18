import { Pool } from 'pg';
import { teamDatabaseUrl } from './team-migrate.js';
import { TeamFault } from './team-model.js';

let pool: Pool | undefined;
let poolUrl: string | undefined;

/** One pool per process, following the current connection string. */
export function getPool(): Pool {
  const connectionString = teamDatabaseUrl();
  if (!connectionString) throw new TeamFault(503, 'Private team access is not configured.');
  // A changed connection string (a rotated credential or a new database) gets a fresh pool.
  if (pool && poolUrl !== connectionString) {
    void pool.end().catch(() => undefined);
    pool = undefined;
  }
  if (!pool) {
    poolUrl = connectionString;
    pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
    pool.on('error', () => console.error('SWDR team database connection failed'));
  }
  return pool;
}

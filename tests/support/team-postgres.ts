/**
 * A disposable PostgreSQL for the team integration and browser tests.
 *
 * With SWDR_TEST_DATABASE_URL already set it is used as is. Otherwise an embedded PostgreSQL cluster
 * (the pinned `embedded-postgres` devDependency) is initialised in a temporary directory on a free
 * loopback port with a random password, and a fresh `swdr_test_*` database is created.
 *
 * Command-line use runs another command with SWDR_TEST_DATABASE_URL pointing at that database:
 *
 *   node --import tsx tests/support/team-postgres.ts node --import tsx --test server/team-postgres.test.ts
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const existing = process.env.SWDR_TEST_DATABASE_URL;
  if (existing) return { url: existing, stop: async () => undefined };
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const directory = await mkdtemp(join(tmpdir(), 'swdr-pg-'));
  const port = await freePort();
  const password = randomBytes(18).toString('base64url');
  const cluster = new EmbeddedPostgres({
    databaseDir: directory,
    port,
    user: 'swdr_test',
    password,
    persistent: false,
    // PostgreSQL refuses to run as root; embedded-postgres then runs it as the `postgres` system user.
    createPostgresUser: process.getuid?.() === 0,
    onLog: () => undefined,
    onError: () => undefined
  });
  await cluster.initialise();
  await cluster.start();
  const name = `swdr_test_${randomBytes(6).toString('hex')}`;
  await cluster.createDatabase(name);
  return {
    url: `postgres://swdr_test:${password}@127.0.0.1:${port}/${name}`,
    stop: async () => {
      await cluster.stop().catch(() => undefined);
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv.slice(2);
  if (!command.length) {
    console.error('Usage: node --import tsx tests/support/team-postgres.ts <command> [args…]');
    process.exit(2);
  }
  const database = await startTestDatabase();
  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, SWDR_TEST_DATABASE_URL: database.url }
  });
  const code = await new Promise<number>(resolve => child.on('exit', status => resolve(status ?? 1)));
  await database.stop();
  process.exitCode = code;
}

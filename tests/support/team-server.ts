/**
 * A local stand-in for the Vercel deployment: serves the built app from dist/ and mounts the real
 * `api/team.ts` handler at /api/team against a real PostgreSQL database.
 *
 *   npm run build
 *   node --import tsx tests/support/team-server.ts            # embedded PostgreSQL, port 4180
 *   SWDR_TEAM_SIGNUP=open PORT=4181 node --import tsx tests/support/team-server.ts
 */
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import handler from '../../api/team.js';
import { startTestDatabase } from './team-postgres.js';

const root = resolve(import.meta.dirname, '../..');
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon'
};

export interface TeamServer {
  origin: string;
  databaseUrl: string;
  database: Pool;
  stop: () => Promise<void>;
}

export async function startTeamServer(options: { port?: number; signup?: 'open' | 'invite' } = {}): Promise<TeamServer> {
  const dist = resolve(root, 'dist');
  await stat(resolve(dist, 'index.html')).catch(() => {
    throw new Error('Run `npm run build` before starting the team test server.');
  });
  const db = await startTestDatabase();
  const database = new Pool({ connectionString: db.url, max: 2 });
  await database.query(await readFile(resolve(root, 'server/team-schema.sql'), 'utf8'));
  process.env.SWDR_TEAM_DATABASE_URL = db.url;
  if (options.signup) process.env.SWDR_TEAM_SIGNUP = options.signup;

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/team') {
      void handler(request, response);
      return;
    }
    void (async () => {
      const path = url.pathname === '/' || url.pathname === '/team' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = resolve(dist, `.${path}`);
      if (!file.startsWith(dist + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const body = await readFile(file);
        response.writeHead(200, {
          'Content-Type': types[extname(file)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache'
        });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(options.port ?? 0, '127.0.0.1', () => done());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    databaseUrl: db.url,
    database,
    stop: async () => {
      const closed = new Promise<void>(done => server.close(() => done()));
      server.closeAllConnections();
      await closed;
      await database.end();
      await db.stop();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const signup = process.env.SWDR_TEAM_SIGNUP === 'open' ? 'open' : 'invite';
  const running = await startTeamServer({ port: Number(process.env.PORT ?? 4180), signup });
  console.log(`SWDR team server on ${running.origin} (sign-up: ${signup})`);
  const stop = () => { void running.stop().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

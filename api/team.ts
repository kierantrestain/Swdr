import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { readSignupMode } from '../server/team-auth.js';
import { ensureSchema, teamDatabaseUrl } from '../server/team-migrate.js';
import { asObject, TeamFault } from '../server/team-model.js';
import { conflictDetails, readAccounts, runTeamAction } from '../server/team-service.js';

/**
 * The caller's address for sign-in throttling. Vercel's edge sets x-real-ip and x-forwarded-for and
 * overwrites client-supplied values; a self-hosted deployment must sit behind a proxy that does the same.
 */
function clientAddress(req: IncomingMessage): string {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

const MAX_BYTES = 4_000_000;
type TeamRequest = IncomingMessage & { body?: unknown };
let pool: Pool | undefined;

function getPool(): Pool {
  const connectionString = teamDatabaseUrl();
  if (!connectionString) throw new TeamFault(503, 'Private team access is not configured.');
  if (!pool) {
    pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
    pool.on('error', () => console.error('SWDR team database connection failed'));
  }
  return pool;
}

function assertSameOrigin(req: TeamRequest) {
  const origin = req.headers.origin;
  let host: string;
  try {
    host = origin ? new URL(origin).host : '';
  } catch {
    throw new TeamFault(403, 'This request did not come from the SWDR workspace.');
  }
  if (!host || host !== req.headers.host || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
    throw new TeamFault(403, 'This request did not come from the SWDR workspace.');
  }
}

async function bodyOf(req: TeamRequest): Promise<Record<string, unknown>> {
  const type = req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/json') throw new TeamFault(415, 'A JSON request is required.');
  if (Number(req.headers['content-length']) > MAX_BYTES) throw new TeamFault(413, 'The project exceeds the hosted request limit.');
  let value: unknown = req.body;
  if (value === undefined) {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_BYTES) throw new TeamFault(413, 'The project exceeds the hosted request limit.');
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > MAX_BYTES) throw new TeamFault(413, 'The project exceeds the hosted request limit.');
    try {
      value = JSON.parse(value);
    } catch {
      throw new TeamFault(400, 'Invalid JSON.');
    }
  }
  const body = asObject(value);
  if (typeof req.body === 'object' && Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) {
    throw new TeamFault(413, 'The project exceeds the hosted request limit.');
  }
  return body;
}

export default async function handler(req: TeamRequest, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Use POST for this route.' }));
    return;
  }
  try {
    assertSameOrigin(req);
    const request = await bodyOf(req);
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)swdr_session=([A-Za-z0-9_-]+)/)?.[1];
    const accounts = readAccounts(process.env.SWDR_TEAM_ACCOUNTS);
    const signup = readSignupMode(process.env.SWDR_TEAM_SIGNUP);
    const database = getPool();
    await ensureSchema(database);
    const result = await runTeamAction(database, accounts, request, cookie, { signup, address: clientAddress(req) });
    if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
    res.end(JSON.stringify({ data: result.data }));
  } catch (error) {
    res.statusCode = error instanceof TeamFault ? error.status : 503;
    if (!(error instanceof TeamFault)) console.error('SWDR team database request failed');
    res.end(JSON.stringify({
      error: error instanceof TeamFault ? error.message : 'The private team workspace is temporarily unavailable.',
      ...conflictDetails(error)
    }));
  }
}

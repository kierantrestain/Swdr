import type { IncomingMessage, ServerResponse } from 'node:http';
import { decodeFountain } from '../src/interchange/screenplay.js';
import { getPool } from '../server/team-db.js';
import { connectorAccount, handleMcp } from '../server/team-mcp.js';
import { ensureSchema } from '../server/team-migrate.js';
import { TeamFault } from '../server/team-model.js';

/**
 * The SWDR connector for Claude and ChatGPT (Model Context Protocol, Streamable HTTP, JSON responses).
 * Reached at /mcp/<personal link>; the link identifies the account and can be revoked in SWDR.
 */
export default async function handler(req: IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> }, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    // No server-initiated stream: every reply comes back on its POST.
    res.statusCode = req.method === 'GET' || req.method === 'DELETE' ? 405 : 404;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ error: 'Use POST.' }));
    return;
  }
  try {
    const url = new URL(req.url ?? '/', 'http://local');
    const token = (Array.isArray(req.query?.token) ? req.query?.token[0] : req.query?.token) ?? url.searchParams.get('token') ?? url.pathname.split('/').pop();
    const pool = getPool();
    await ensureSchema(pool);
    const email = await connectorAccount(pool, token);
    let body = req.body;
    if (body === undefined) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      body = Buffer.concat(chunks).toString('utf8');
    }
    const parsed = typeof body === 'string' ? JSON.parse(body) as unknown : body;
    const decode = (text: string) => decodeFountain(text, 'Connector').document.blocks;
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    const replies = (await Promise.all(messages.map(message => handleMcp(pool, email, message as never, decode)))).filter(Boolean);
    if (!replies.length) { res.statusCode = 202; res.end(); return; }
    res.end(JSON.stringify(Array.isArray(parsed) ? replies : replies[0]));
  } catch (error) {
    res.statusCode = error instanceof TeamFault ? error.status : error instanceof SyntaxError ? 400 : 503;
    if (!(error instanceof TeamFault)) console.error('SWDR connector request failed');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: error instanceof TeamFault ? error.message : 'SWDR is unavailable right now.' } }));
  }
}

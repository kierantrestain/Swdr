/**
 * The SWDR connector for Claude and ChatGPT: a Model Context Protocol server over Streamable HTTP.
 * Each account gets one private connector link (stored as a digest, revocable); Claude and ChatGPT
 * call it with JSON-RPC and get plain JSON back.
 */
import type { Pool } from 'pg';
import { newToken, TOKEN, tokenDigest } from './team-auth.js';
import { TeamFault } from './team-model.js';
import { CONNECTOR_TOOLS, runConnectorTool } from './team-service.js';
import type { DocumentModel } from '../src/model.js';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export async function createConnectorLink(db: Pool, email: string, origin: string): Promise<{ url: string }> {
  await db.query('UPDATE swdr_mcp_tokens SET revoked_at = now() WHERE email = $1 AND revoked_at IS NULL', [email]);
  const token = newToken();
  await db.query('INSERT INTO swdr_mcp_tokens (digest, email) VALUES ($1, $2)', [tokenDigest(token), email]);
  return { url: `${origin}/mcp/${token}` };
}

export async function revokeConnectorLinks(db: Pool, email: string): Promise<void> {
  await db.query('UPDATE swdr_mcp_tokens SET revoked_at = now() WHERE email = $1 AND revoked_at IS NULL', [email]);
}

export async function connectorStatus(db: Pool, email: string): Promise<{ active: boolean; lastUsed?: string }> {
  const row = await db.query<{ last_used_at: Date | null }>('SELECT last_used_at FROM swdr_mcp_tokens WHERE email = $1 AND revoked_at IS NULL', [email]);
  return row.rows[0] ? { active: true, ...(row.rows[0].last_used_at ? { lastUsed: row.rows[0].last_used_at.toISOString() } : {}) } : { active: false };
}

export async function connectorAccount(db: Pool, token: unknown): Promise<string> {
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new TeamFault(404, 'Unknown connector link.');
  const row = await db.query<{ email: string }>(
    `UPDATE swdr_mcp_tokens SET last_used_at = now() WHERE digest = $1 AND revoked_at IS NULL RETURNING email`, [tokenDigest(token)]
  );
  if (!row.rows[0]) throw new TeamFault(404, 'This connector link was revoked. Create a new one in SWDR.');
  return row.rows[0].email;
}

interface Rpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/** Answers one JSON-RPC message; undefined for notifications, which get no reply. */
export async function handleMcp(pool: Pool, email: string, message: Rpc, decode: (fountain: string) => DocumentModel['blocks']): Promise<Record<string, unknown> | undefined> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: message.id ?? null, result });
  const fail = (code: number, text: string) => ({ jsonrpc: '2.0', id: message.id ?? null, error: { code, message: text } });
  if (message.id === undefined || message.method?.startsWith('notifications/')) return undefined;
  switch (message.method) {
    case 'initialize': {
      const asked = String(message.params?.protocolVersion ?? '');
      return reply({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'swdr', title: 'SWDR', version: '1.0.0' },
        instructions: 'SWDR is a screenwriting and production workspace. Use list_projects first, then read_project to find script IDs. Scripts are Fountain screenplay text. Ask before adding to a script.'
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: CONNECTOR_TOOLS.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: tool.readOnly, destructiveHint: false } })) });
    case 'tools/call': {
      const name = String(message.params?.name ?? '');
      if (!CONNECTOR_TOOLS.some(tool => tool.name === name)) return fail(-32602, `Unknown tool ${name}.`);
      try {
        const text = await runConnectorTool(pool, email, name, (message.params?.arguments ?? {}) as Record<string, unknown>, decode);
        return reply({ content: [{ type: 'text', text }] });
      } catch (error) {
        // Tool problems go back to the model as results it can act on, not protocol errors.
        return reply({ content: [{ type: 'text', text: error instanceof TeamFault ? error.message : 'SWDR could not complete that.' }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${message.method}`);
  }
}

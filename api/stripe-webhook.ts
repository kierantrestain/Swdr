import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleStripeEvent, verifyStripeSignature } from '../server/team-billing.js';
import { getPool } from '../server/team-db.js';
import { ensureSchema } from '../server/team-migrate.js';

// Stripe signs the exact bytes it sends, so the body must be read raw, not parsed.
export const config = { api: { bodyParser: false } };

/** Grants SWDR Pro when Stripe reports a paid Checkout. Every request must carry a valid signature. */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const payload = Buffer.concat(chunks).toString('utf8');
  const signature = req.headers['stripe-signature'];
  if (!verifyStripeSignature(payload, Array.isArray(signature) ? signature[0] : signature, process.env.STRIPE_WEBHOOK_SECRET ?? '')) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid signature.' }));
    return;
  }
  try {
    const pool = getPool();
    await ensureSchema(pool);
    const outcome = await handleStripeEvent(pool, JSON.parse(payload));
    res.end(JSON.stringify({ received: true, outcome }));
  } catch {
    console.error('SWDR billing webhook failed');
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Retry later.' }));
  }
}

/**
 * Plans. Free accounts get the whole app on their device, one cloud team project and a small AI allowance;
 * SWDR Pro is a one-time lifetime purchase through Stripe Checkout that lifts those limits and adds the
 * Claude/ChatGPT connector. While Stripe is not configured, every account gets Pro limits.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { TeamFault } from './team-model.js';

export type Plan = 'free' | 'pro';
type Env = Record<string, string | undefined>;

export const billingEnabled = (env: Env = process.env) => Boolean(env.STRIPE_SECRET_KEY?.trim());
export const proPrice = (env: Env = process.env) => Number(env.SWDR_PRO_PRICE_PENCE) || 9900;

/** The plan that applies: the stored plan when billing is on, Pro for everyone when it is off. */
export function effectivePlan(stored: string | null | undefined, env: Env = process.env): Plan {
  return !billingEnabled(env) || stored === 'pro' ? 'pro' : 'free';
}

export const LIMITS: Record<Plan, { teamProjects: number; aiPerDay: number; connector: boolean }> = {
  free: { teamProjects: 1, aiPerDay: 10, connector: false },
  pro: { teamProjects: Infinity, aiPerDay: 150, connector: true }
};

export function aiAllowance(plan: Plan, env: Env = process.env): number {
  return plan === 'pro' ? Number(env.SWDR_AI_PRO_LIMIT) || LIMITS.pro.aiPerDay : Number(env.SWDR_AI_DAILY_LIMIT) || LIMITS.free.aiPerDay;
}

export async function storedPlan(db: Pool, email: string): Promise<Plan> {
  const row = await db.query<{ plan: string }>('SELECT plan FROM swdr_team_users WHERE email = $1', [email]);
  return effectivePlan(row.rows[0]?.plan);
}

export function requirePro(plan: Plan, feature: string): void {
  if (plan !== 'pro') throw new TeamFault(402, `${feature} is part of SWDR Pro — a one-time £${(proPrice() / 100).toFixed(0)} lifetime upgrade.`);
}

/** A Stripe Checkout page for the lifetime upgrade. The webhook, not this redirect, grants Pro. */
export async function createCheckout(email: string, origin: string, env: Env = process.env): Promise<{ url: string }> {
  if (!billingEnabled(env)) throw new TeamFault(503, 'Upgrades are not open yet.');
  const form = new URLSearchParams({
    mode: 'payment',
    customer_email: email,
    client_reference_id: email,
    success_url: `${origin}/#team?upgraded=1`,
    cancel_url: `${origin}/#team`,
    'line_items[0][quantity]': '1',
    'metadata[plan]': 'pro',
    'payment_intent_data[metadata][plan]': 'pro',
    allow_promotion_codes: 'true'
  });
  if (env.STRIPE_PRICE_ID?.trim()) form.set('line_items[0][price]', env.STRIPE_PRICE_ID.trim());
  else {
    form.set('line_items[0][price_data][currency]', (env.SWDR_PRO_CURRENCY || 'gbp').toLowerCase());
    form.set('line_items[0][price_data][unit_amount]', String(proPrice(env)));
    form.set('line_items[0][price_data][product_data][name]', 'SWDR Pro — lifetime');
    form.set('line_items[0][price_data][product_data][description]', 'Unlimited team projects, 150 AI requests a day and the Claude/ChatGPT connector, for life.');
  }
  const response = await fetch(`${env.SWDR_STRIPE_API ?? 'https://api.stripe.com'}/v1/checkout/sessions`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
  });
  const session = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !session.url) throw new TeamFault(502, 'Checkout could not start. Try again shortly.');
  return { url: session.url };
}

/** Verifies a Stripe webhook signature (t=…,v1=…) over the raw body, with a five-minute tolerance. */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(part => part.split('=') as [string, string]).filter(([key]) => key === 't'));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest();
  return header.split(',').filter(part => part.startsWith('v1=')).some(part => {
    const given = Buffer.from(part.slice(3), 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Grants Pro for a completed, paid Checkout. Safe to receive more than once. */
export async function handleStripeEvent(db: Pool, event: { type?: string; data?: { object?: Record<string, unknown> } }): Promise<string> {
  const session = event.data?.object ?? {};
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if ((event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') || !paid) return 'ignored';
  const email = String(session.client_reference_id ?? '').toLowerCase();
  if (!email.includes('@')) return 'ignored';
  const result = await db.query(
    `UPDATE swdr_team_users SET plan = 'pro', pro_since = COALESCE(pro_since, now()), stripe_session = $2 WHERE email = $1`,
    [email, String(session.id ?? '')]
  );
  return result.rowCount ? 'upgraded' : 'unknown account';
}

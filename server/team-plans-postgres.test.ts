import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import mcp from '../api/mcp';
import webhook from '../api/stripe-webhook';
import team from '../api/team';
import { newDocument, newBlock } from '../src/model';
import { createProject } from '../src/workspace/project';
import { verifyStripeSignature } from './team-billing';

const databaseUrl = process.env.SWDR_TEST_DATABASE_URL;

test('Stripe signatures are checked over the raw body with a time window', () => {
  const body = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
  assert.ok(verifyStripeSignature(body, `t=${t},v1=${v1}`, 'whsec_test'));
  assert.ok(!verifyStripeSignature(body, `t=${t},v1=${v1}`, 'whsec_other'));
  assert.ok(!verifyStripeSignature(`${body} `, `t=${t},v1=${v1}`, 'whsec_test'));
  assert.ok(!verifyStripeSignature(body, `t=${t - 400},v1=${createHmac('sha256', 'whsec_test').update(`${t - 400}.${body}`).digest('hex')}`, 'whsec_test'));
});

test('plans, Stripe checkout and webhook, password reset by email and the MCP connector', { skip: !databaseUrl }, async t => {
  const db = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });
  t.after(async () => { await db.end(); });
  // Stand-ins for Stripe and Resend that record what SWDR sends.
  const sent: { checkout?: URLSearchParams; emails: Array<{ to: string[]; text: string; from: string }> } = { emails: [] };
  const fakes = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v1/checkout/sessions') { sent.checkout = new URLSearchParams(body); response.end(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' })); return; }
      if (request.url === '/emails') { sent.emails.push(JSON.parse(body)); response.end(JSON.stringify({ id: 'em_1' })); return; }
      response.statusCode = 404; response.end('{}');
    });
  });
  await new Promise<void>(resolve => fakes.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => fakes.close(() => resolve())));
  const fake = `http://127.0.0.1:${(fakes.address() as { port: number }).port}`;
  Object.assign(process.env, {
    SWDR_TEAM_DATABASE_URL: databaseUrl, SWDR_TEAM_SIGNUP: 'open', STRIPE_SECRET_KEY: 'sk_test_x', SWDR_STRIPE_API: fake, STRIPE_WEBHOOK_SECRET: 'whsec_test',
    RESEND_API_KEY: 're_test', RESEND_FROM: 'SWDR <hello@swdr.test>', SWDR_RESEND_API: fake, SWDR_RECOVERY_KEY: 'owner-recovery-key-0123456789abcdef'
  });
  t.after(() => { for (const key of ['SWDR_TEAM_DATABASE_URL', 'SWDR_TEAM_SIGNUP', 'STRIPE_SECRET_KEY', 'SWDR_STRIPE_API', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'RESEND_FROM', 'SWDR_RESEND_API', 'SWDR_RECOVERY_KEY']) delete process.env[key]; });

  const app = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === '/api/team') void team(request, response);
    else if (request.url?.startsWith('/mcp/')) void mcp(request, response);
    else if (request.url === '/api/stripe-webhook') void webhook(request, response);
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => app.close(() => resolve())));
  const origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  let cookie = '';
  const call = async <T>(action: string, body: Record<string, unknown> = {}, jar = cookie) => {
    const response = await fetch(`${origin}/api/team`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(jar ? { cookie: jar } : {}) }, body: JSON.stringify({ ...body, action }) });
    const setCookie = response.headers.get('set-cookie');
    const payload = await response.json() as { data?: T; error?: string };
    return { status: response.status, data: payload.data, error: payload.error, cookie: setCookie?.split(';')[0] };
  };

  const email = `pro-${randomBytes(3).toString('hex')}@plans.test`;
  const signed = await call<{ account: { email: string } }>('sign-up', { name: 'Pat Writer', email, password: 'a ferry at dawn 1987' });
  assert.equal(signed.status, 200, signed.error);
  cookie = signed.cookie!;
  const session = await call<{ plan: string; billing: boolean }>('session');
  assert.deepEqual([session.data?.plan, session.data?.billing], ['free', true]);

  // Free: one cloud team project.
  const project = (title: string) => {
    const made = createProject(title, 'film');
    made.documents = [{ ...newDocument('Pilot', 'screenplay'), blocks: [newBlock('scene', 'INT. FERRY OFFICE - NIGHT'), newBlock('action', 'Rain.')] }];
    return made;
  };
  const first = project('First');
  assert.equal((await call('create', { project: first })).status, 200);
  const second = await call('create', { project: project('Second') });
  assert.equal(second.status, 402);
  assert.match(second.error!, /SWDR Pro — a one-time £99 lifetime upgrade/);
  assert.equal((await call('connector-create')).status, 402);

  // Checkout, then the signed webhook unlocks Pro; a forged webhook does nothing.
  const checkout = await call<{ url: string }>('checkout');
  assert.equal(checkout.data?.url, 'https://checkout.stripe.test/cs_1');
  assert.equal(sent.checkout?.get('mode'), 'payment');
  assert.equal(sent.checkout?.get('client_reference_id'), email);
  assert.equal(sent.checkout?.get('line_items[0][price_data][unit_amount]'), '9900');
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', client_reference_id: email } } });
  const forged = await fetch(`${origin}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: event });
  assert.equal(forged.status, 400);
  const time = Math.floor(Date.now() / 1000);
  const signature = `t=${time},v1=${createHmac('sha256', 'whsec_test').update(`${time}.${event}`).digest('hex')}`;
  const delivered = await fetch(`${origin}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': signature }, body: event });
  assert.deepEqual(await delivered.json(), { received: true, outcome: 'upgraded' });
  assert.equal((await call<{ plan: string }>('session')).data?.plan, 'pro');
  assert.equal((await call('create', { project: project('Second') })).status, 200);

  // Connector: initialise, list tools, read and write a script, then revoke.
  const link = await call<{ url: string }>('connector-create');
  const url = link.data!.url.replace(/^https?:\/\/[^/]+/, origin);
  const rpc = async (method: string, params: Record<string, unknown> = {}, id: number | undefined = 1) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    return { status: response.status, body: response.status === 202 ? undefined : await response.json() as { result?: { tools?: Array<{ name: string }>; content?: Array<{ text: string }>; protocolVersion?: string; isError?: boolean } } };
  };
  assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude', version: '1' } })).body?.result?.protocolVersion, '2025-06-18');
  assert.equal((await rpc('notifications/initialized', {}, undefined)).status, 202);
  assert.deepEqual((await rpc('tools/list')).body?.result?.tools?.map(tool => tool.name), ['list_projects', 'read_project', 'read_script', 'read_outline', 'add_beat', 'add_to_script']);
  assert.match((await rpc('tools/call', { name: 'list_projects', arguments: {} })).body!.result!.content![0].text, new RegExp(`First \\(film\\) — id ${first.id}`));
  const documentId = first.documents[0].id;
  const added = await rpc('tools/call', { name: 'add_to_script', arguments: { projectId: first.id, documentId, fountain: 'NORA\nKeep the lamp lit.' } });
  assert.match(added.body!.result!.content![0].text, /Added 2 lines to Pilot/);
  assert.match((await rpc('tools/call', { name: 'read_script', arguments: { projectId: first.id, documentId, scene: '1' } })).body!.result!.content![0].text, /INT\. FERRY OFFICE - NIGHT[\s\S]*NORA\nKeep the lamp lit\./);
  assert.equal((await rpc('tools/call', { name: 'read_script', arguments: { projectId: 'someone-elses', documentId } })).body?.result?.isError, true);
  await call('connector-revoke');
  assert.equal((await rpc('tools/list')).status, 404);

  // Password reset: an email with a single-use link; no clue for unknown addresses; old sessions end.
  assert.deepEqual((await call('request-reset', { email: 'nobody@plans.test' }, '')).data, { sent: true });
  assert.equal(sent.emails.length, 0);
  assert.deepEqual((await call('request-reset', { email }, '')).data, { sent: true });
  assert.equal(sent.emails[0].to[0], email);
  assert.equal(sent.emails[0].from, 'SWDR <hello@swdr.test>');
  const token = sent.emails[0].text.match(/#team\?reset=([A-Za-z0-9_-]{43})/)![1];
  assert.equal((await call('reset-password', { token, password: 'short' }, '')).status, 400);
  const reset = await call('reset-password', { token, password: 'a new lamp for the pier' }, '');
  assert.deepEqual(reset.data, { email }, reset.error);
  assert.equal((await call('reset-password', { token, password: 'a new lamp for the pier' }, '')).status, 410);
  assert.equal((await call('session')).status, 401);
  assert.equal((await call('sign-in', { email, password: 'a new lamp for the pier' }, '')).status, 200);

  // Without email, the workspace owner's recovery key resets a password.
  assert.equal((await call('recovery-reset', { email, key: 'wrong-key', password: 'the harbour at night' }, '')).status, 401);
  assert.deepEqual((await call('recovery-reset', { email, key: 'owner-recovery-key-0123456789abcdef', password: 'the harbour at night' }, '')).data, { email });
  assert.equal((await call('sign-in', { email, password: 'the harbour at night' }, '')).status, 200);
  assert.equal((await call<{ reset: string }>('config', {}, '')).data?.reset, 'email');
});

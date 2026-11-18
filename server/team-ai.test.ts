import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { aiModels, aiProviders, openRouterKey, readAiRequest, readKeys, streamAi, writingModels } from './team-ai';
import { parseBeats } from '../src/ai/beats';
import { trainingExamples } from '../src/ai/dataset';
import { aiContext } from '../src/ai/context';
import { newBlock } from '../src/model';
import { createProject } from '../src/workspace/project';

/** A stand-in OpenAI-compatible provider: lists two models and streams an answer as server-sent events. */
async function fakeProvider() {
  const seen: Array<Record<string, unknown>> = [];
  const server = createServer((request, response) => {
    if (request.url === '/v1/auth/keys') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const sent = JSON.parse(body) as { code: string; code_verifier: string; code_challenge_method: string };
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(sent.code === 'good-code-123' && sent.code_challenge_method === 'S256' && sent.code_verifier.length >= 43 ? { key: 'sk-or-user-key-0001' } : { error: 'bad' }));
      });
      return;
    }
    if (request.url === '/v1/models') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'my-voice-lora', pricing: { prompt: '0', completion: '0' } }, { id: 'big-model:paid' }] }));
      return;
    }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      seen.push({ ...JSON.parse(body), authorization: request.headers.authorization });
      response.setHeader('Content-Type', 'text/event-stream');
      for (const piece of ['NORA\n', 'I kept ', 'the ticket.']) response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      response.write(': keep-alive\n\ndata: [DONE]\n\n');
      response.end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/v1`, seen, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('providers switch on by key, and a custom server serves your own fine-tuned model', async t => {
  assert.deepEqual(aiProviders({}), []);
  assert.deepEqual(aiProviders({ Gemini_API_Key: 'AIza-test-key' }).map(item => item.id), ['gemini']);
  assert.deepEqual(aiProviders({ ANTHROPIC_API_KEY: 'k', GROQ_API_KEY: 'g', SWDR_AI_GROQ_MODELS: 'llama-3.3-70b-versatile' }).map(item => [item.id, item.models]),
    [['anthropic', ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']], ['groq', ['llama-3.3-70b-versatile']]]);
  const fake = await fakeProvider();
  t.after(fake.close);
  const env = { SWDR_AI_CUSTOM_BASE_URL: fake.url, SWDR_AI_CUSTOM_API_KEY: 'secret', SWDR_AI_CUSTOM_LABEL: 'House voice' };
  const listed = await aiModels(env);
  assert.deepEqual(listed.models.map(item => [item.id, item.provider, item.free]), [['custom:my-voice-lora', 'House voice', true], ['custom:big-model:paid', 'House voice', false]]);
  assert.equal(listed.defaultModel, 'custom:my-voice-lora');

  let text = '';
  await streamAi(readAiRequest({ mode: 'continue', model: 'custom:my-voice-lora', context: 'Project: Lamp', prompt: 'darker' }), chunk => { text += chunk; }, undefined, env);
  assert.equal(text, 'NORA\nI kept the ticket.');
  const sent = fake.seen[0] as { model: string; stream: boolean; authorization: string; messages: Array<{ role: string; content: string }> };
  assert.equal(sent.model, 'my-voice-lora');
  assert.equal(sent.stream, true);
  assert.equal(sent.authorization, 'Bearer secret');
  assert.match(sent.messages[0].content, /writing partner inside SWDR[\s\S]*<project_context>\nProject: Lamp/);
  assert.match(sent.messages.at(-1)!.content, /Continue the scene[\s\S]*Writer's note: darker/);
});

test('requests are validated and need a configured provider', async () => {
  assert.throws(() => readAiRequest({ mode: 'hack' }), /Choose what you want help with/);
  assert.throws(() => readAiRequest({ mode: 'ask', prompt: ' ' }), /Type a question/);
  assert.throws(() => readAiRequest({ mode: 'notes', context: 'x'.repeat(60_001) }), /too long/);
  assert.equal(readAiRequest({ mode: 'notes', model: 'bad model!' }).model, undefined);
  await assert.rejects(streamAi(readAiRequest({ mode: 'notes' }), () => undefined, undefined, {}), /No AI model is connected yet/);
  await assert.rejects(streamAi(readAiRequest({ mode: 'notes', model: 'openai:gpt' }), () => undefined, undefined, { GROQ_API_KEY: 'g', SWDR_AI_GROQ_MODELS: 'x' }), /not available/);
});

test("context carries the scene at the cursor, and training data pairs each heading with the writer's real scene", () => {
  const project = createProject('Lamp', 'film', 'A keeper lies to save her crew.');
  const script = project.documents[0];
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  script.blocks = [newBlock('scene', 'INT. LIGHTHOUSE - NIGHT'), newBlock('action', words(30)), newBlock('character', 'Nora'), newBlock('dialogue', 'Keep it lit.'),
    newBlock('scene', 'EXT. PIER - DAY'), newBlock('action', words(40))];
  const context = aiContext(project, script, { blockId: script.blocks[3].id, selection: 'Keep it lit.' });
  assert.match(context, /Current scene \(where the writer's cursor is\):\nINT\. LIGHTHOUSE - NIGHT[\s\S]*NORA\nKeep it lit\./);
  assert.doesNotMatch(context.split('Current scene')[1].split('Sample')[0], /EXT\. PIER/);
  assert.match(context, /Selected text:\nKeep it lit\./);
  const examples = trainingExamples([project]);
  assert.equal(examples.length, 2);
  assert.match(examples[1].messages[1].content, /Previous scene:[\s\S]*Write the scene that begins: EXT\. PIER - DAY/);
  assert.match(examples[1].messages[2].content, /^EXT\. PIER - DAY/);
});

test("a user's own key runs requests on their account, and OpenRouter sign-in returns their key", async t => {
  const fake = await fakeProvider();
  t.after(fake.close);
  const env = { SWDR_AI_OPENROUTER_BASE_URL: fake.url, GROQ_API_KEY: 'workspace-key', SWDR_AI_GROQ_MODELS: 'llama' };
  assert.throws(() => readKeys({ openai: 'short' }), /That OpenAI key does not look right/);
  assert.deepEqual(readKeys({ openrouter: 'sk-or-user-key-0001', unknown: 'x' }), { openrouter: 'sk-or-user-key-0001' });

  const listed = await aiModels(env, { openrouter: 'sk-or-user-key-0001' });
  assert.equal(listed.defaultModel, 'mine-openrouter:my-voice-lora');
  assert.deepEqual(listed.models.map(item => item.provider), ['OpenRouter (your account)', 'OpenRouter (your account)', 'Groq']);

  let text = '';
  await streamAi(readAiRequest({ mode: 'ask', prompt: 'Who lies?', model: 'mine-openrouter:my-voice-lora', keys: { openrouter: 'sk-or-user-key-0001' } }), chunk => { text += chunk; }, undefined, env);
  assert.equal(text, 'NORA\nI kept the ticket.');
  assert.equal((fake.seen[0] as { authorization: string }).authorization, 'Bearer sk-or-user-key-0001');

  assert.deepEqual(await openRouterKey({ code: 'good-code-123', verifier: 'v'.repeat(64) }, env), { key: 'sk-or-user-key-0001' });
  await assert.rejects(openRouterKey({ code: 'wrong-code-456', verifier: 'v'.repeat(64) }, env), /did not approve/);
  await assert.rejects(openRouterKey({ code: 'x', verifier: 'short' }, env), /could not be completed/);
});

test('Gemini lists only writing models, best first; a failing model falls through to the next; outline beats parse', async t => {
  const listed = writingModels({ id: 'gemini', label: 'Google Gemini' }, ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.1-pro-preview', 'lyria-3.5', 'gemini-robotics-er-2-preview',
    'gemini-3.8-live', 'nano-banana-pro-preview', 'deep-research-preview-04-2026', 'gemini-3.8-flash-lite', 'models/gemini-3.9-flash-preview', 'antigravity-preview-latest', 'gemini-embedding-2'].map(id => ({ id })));
  assert.deepEqual(listed.map(item => item.label), ['Gemini 3.9 Flash (preview)', 'Gemini 3.8 Flash', 'Gemini 3.8 Pro', 'Gemini 3.8 Flash-Lite', 'Gemini 3.1 Pro (preview)', 'Gemini 2.5 Flash']);
  assert.equal(listed[1].id, 'gemini:gemini-3.8-flash');

  // A provider whose first model is retired: SWDR moves to the next model and says nothing went wrong.
  const server = createServer((request, response) => {
    if (request.url === '/v1/models') { response.end(JSON.stringify({ data: [{ id: 'retired-model' }, { id: 'working-model' }] })); return; }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      if (JSON.parse(body).model === 'retired-model') { response.statusCode = 404; response.end(JSON.stringify({ error: { message: 'models/retired-model is not found' } })); return; }
      response.setHeader('Content-Type', 'text/event-stream');
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Plan ready.' } }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const env = { SWDR_AI_CUSTOM_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` };
  let text = '';
  await streamAi(readAiRequest({ mode: 'outline', model: 'custom:retired-model' }), chunk => { text += chunk; }, undefined, env);
  assert.equal(text, 'Plan ready.');

  assert.deepEqual(parseBeats('I | The last boat | Nora misses the ferry and finds a ticket.\n- II | Lies | She covers for Elias.\nIII: Reckoning | The tide turns.\nBiggest question: who sold the ticket?'), [
    { act: 1, title: 'The last boat', notes: 'Nora misses the ferry and finds a ticket.' },
    { act: 2, title: 'Lies', notes: 'She covers for Elias.' },
    { act: 3, title: 'Reckoning', notes: 'The tide turns.' }
  ]);
});

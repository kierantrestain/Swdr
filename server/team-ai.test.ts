import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { aiModels, aiProviders, readAiRequest, streamAi } from './team-ai';
import { trainingExamples } from '../src/ai/dataset';
import { aiContext } from '../src/ai/context';
import { newBlock } from '../src/model';
import { createProject } from '../src/workspace/project';

/** A stand-in OpenAI-compatible provider: lists two models and streams an answer as server-sent events. */
async function fakeProvider() {
  const seen: Array<Record<string, unknown>> = [];
  const server = createServer((request, response) => {
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
  await assert.rejects(streamAi(readAiRequest({ mode: 'notes' }), () => undefined, undefined, {}), /not set up/);
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

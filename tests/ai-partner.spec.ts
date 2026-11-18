import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { expect, loadDemo, manuscript, test } from './support/browser';
import { startTeamServer } from './support/team-server';
import type { TeamServer } from './support/team-server';

// The AI partner end to end against a stand-in OpenAI-compatible provider (as a self-hosted fine-tuned
// model would be), through the real /api/team handler and PostgreSQL. Requires `npm run build`.

let server: TeamServer;
let provider: Server;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  provider = createServer((request, response) => {
    if (request.url === '/v1/models') { response.end(JSON.stringify({ data: [{ id: 'house-voice', pricing: { prompt: '0', completion: '0' } }] })); return; }
    request.resume();
    request.on('end', () => {
      response.setHeader('Content-Type', 'text/event-stream');
      for (const piece of ['NORA\n', 'The last boat ', 'never left.\n\n', 'She pockets the ticket.']) response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  process.env.SWDR_AI_CUSTOM_BASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
  process.env.SWDR_AI_CUSTOM_LABEL = 'House voice';
  server = await startTeamServer({ signup: 'open' });
});
test.afterAll(async () => {
  delete process.env.SWDR_AI_CUSTOM_BASE_URL;
  delete process.env.SWDR_AI_CUSTOM_LABEL;
  await server?.stop();
  await new Promise<void>(resolve => provider?.close(() => resolve()));
});

test('the AI partner streams a scene continuation from the chosen model and inserts it into the script', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', baseURL: server.origin });
  const page = await context.newPage();
  const faults: string[] = [];
  page.on('pageerror', error => faults.push(error.message));
  try {
    await page.goto('/');
    await loadDemo(page);
    // Signed out: the partner explains how to start.
    await page.getByRole('button', { name: 'Resume screenplay' }).click();
    await page.getByRole('button', { name: 'AI partner' }).click();
    const dialog = page.getByRole('dialog', { name: 'AI partner' });
    await expect(dialog.getByText('Sign in to use the AI partner')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/#team');
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByRole('textbox', { name: 'Your name' }).fill('Ada Writer');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@ai.test');
    await page.getByRole('textbox', { name: 'Password' }).fill('the lamp keeps turning');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Team projects' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'Resume screenplay' }).click();
    const editor = manuscript(page);
    await editor.locator('.swdr-el-dialogue').last().click();
    await page.getByRole('button', { name: 'AI partner' }).click();
    await expect(dialog.getByRole('combobox', { name: 'Model' })).toHaveValue('custom:house-voice');
    await expect(dialog.getByRole('option', { name: 'house-voice · free' })).toBeAttached();
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Direction for the AI partner' }).fill('quieter');
    await dialog.getByRole('button', { name: 'Generate' }).click();
    await expect(dialog.getByRole('region', { name: 'AI partner response' })).toContainText('The last boat never left.');
    await dialog.getByRole('button', { name: 'Insert into script' }).click();
    await expect(editor).toContainText('The last boat never left.');
    await expect(editor).toContainText('She pockets the ticket.');
    expect(faults).toEqual([]);
  } finally {
    await context.close();
  }
});

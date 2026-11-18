import { readFileSync } from 'node:fs';
import { expect, loadDemo, test } from './support/browser';

// Serves every response with the production headers from vercel.json, so a Content-Security-Policy that
// would block part of the app fails here instead of on the live site.
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
const production = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)')!.headers.map(header => [header.key.toLowerCase(), header.value]));

test('the app runs under the production security headers', async ({ page, context }) => {
  test.setTimeout(90_000);
  expect(production['content-security-policy']).toContain("script-src 'self'");
  await context.route('**/*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...production } });
  });
  const blocked: string[] = [];
  page.on('console', message => { if (/Content Security Policy|Refused to/i.test(message.text())) blocked.push(message.text()); });
  page.on('pageerror', error => blocked.push(error.message));
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Project sections' });
  for (const name of ['Overview', 'Schedule', 'Budget', 'Files & media']) await nav.getByRole('link', { name, exact: true }).click();
  await page.getByRole('link', { name: 'Projects' }).first().click();
  await page.getByRole('button', { name: 'Open project Frame by Frame' }).click();
  await nav.getByRole('link', { name: /Creator studio/ }).click();
  await page.getByRole('button', { name: /How a 3-person crew/ }).click();
  await page.getByRole('button', { name: 'Play preview' }).click();
  await page.waitForTimeout(600);
  expect(blocked).toEqual([]);
});

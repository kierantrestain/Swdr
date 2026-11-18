import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, loadDemo, manuscript, test } from './support/browser';
import { startTeamServer } from './support/team-server';
import type { TeamServer } from './support/team-server';

// Two people in one script against the real /api/team handler and PostgreSQL: each sees the other's avatar
// and caret, and edits at both ends of the same line merge instead of conflicting. Requires `npm run build`.

const owner = { name: 'Olive Owner', email: 'olive@live.test', password: 'the ferry leaves at dawn' };
const writer = { name: 'Wes Writer', email: 'wes@live.test', password: 'paper tickets only 1987' };

let server: TeamServer;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  server = await startTeamServer({ signup: 'open' });
});
test.afterAll(async () => { await server?.stop(); });

async function context(browser: Browser): Promise<BrowserContext> {
  const created = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', baseURL: server.origin });
  await created.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.origin });
  return created;
}

async function openDoubt(page: Page) {
  await page.locator('.team-editor-tools label', { hasText: 'Document' }).locator('select').selectOption({ label: 'Doubt' });
  await expect(manuscript(page)).toContainText('INT. FERRY OFFICE');
}

test('two writers see each other live and both keep their words in the same line', async ({ browser }) => {
  test.setTimeout(180_000);
  const faults: string[] = [];
  const ownerContext = await context(browser);
  const writerContext = await context(browser);
  try {
    const ownerPage = await ownerContext.newPage();
    const writerPage = await writerContext.newPage();
    for (const page of [ownerPage, writerPage]) page.on('pageerror', error => faults.push(error.message));

    await ownerPage.goto('/');
    await loadDemo(ownerPage);
    await ownerPage.goto('/#team');
    await ownerPage.getByRole('tab', { name: 'Create account' }).click();
    await ownerPage.getByRole('textbox', { name: 'Your name' }).fill(owner.name);
    await ownerPage.getByRole('textbox', { name: 'Email' }).fill(owner.email);
    await ownerPage.getByRole('textbox', { name: 'Password' }).fill(owner.password);
    await ownerPage.getByRole('button', { name: 'Create account', exact: true }).click();
    await ownerPage.getByLabel('Share a local project').selectOption({ label: 'The North Shore' });
    await ownerPage.getByRole('button', { name: 'Create private copy' }).click();
    await expect(ownerPage.getByText('Team synced')).toBeVisible({ timeout: 15_000 });
    await expect(ownerPage.getByText('Only you are here')).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Team & sharing' }).click();
    const sharing = ownerPage.getByRole('region', { name: 'Team and sharing' });
    await sharing.getByRole('button', { name: 'Invite people' }).click();
    const inviteDialog = ownerPage.getByRole('dialog', { name: 'Invite people' });
    await inviteDialog.getByRole('textbox', { name: 'Email' }).fill(writer.email);
    await inviteDialog.getByRole('button', { name: 'Create invitation link' }).click();
    const linkDialog = ownerPage.getByRole('dialog', { name: 'Copy the link and send it' });
    const link = await linkDialog.getByRole('textbox', { name: 'Invitation link' }).inputValue();
    await linkDialog.getByRole('button', { name: 'Done' }).click();
    await ownerPage.getByRole('button', { name: 'Team & sharing' }).click();

    await writerPage.goto(link);
    await writerPage.getByRole('textbox', { name: 'Your name' }).fill(writer.name);
    await writerPage.getByRole('textbox', { name: 'Password' }).fill(writer.password);
    await writerPage.getByRole('button', { name: 'Create account and join' }).click();
    await expect(writerPage.getByText('Team synced')).toBeVisible({ timeout: 15_000 });

    await openDoubt(ownerPage);
    await openDoubt(writerPage);
    const line = (page: Page) => manuscript(page).locator('.swdr-el-dialogue').first();
    await line(writerPage).click();
    await writerPage.keyboard.press('End');

    // Presence: each sees the other, and the owner sees the writer's named caret in the script.
    await expect(ownerPage.getByRole('button', { name: /Jump to Wes Writer — (typing|viewing) in Doubt/ })).toBeVisible({ timeout: 15_000 });
    await expect(writerPage.getByRole('button', { name: /Jump to Olive Owner/ })).toBeVisible({ timeout: 15_000 });
    await expect(ownerPage.locator('.remote-caret', { hasText: 'Wes Writer' })).toBeVisible({ timeout: 15_000 });
    await expect(ownerPage.getByText('2 here')).toBeVisible();

    // Both edit the same line at once: the writer at the end, the owner at the start.
    await line(ownerPage).click();
    await ownerPage.keyboard.press('Home');
    await Promise.all([ownerPage.keyboard.type('Late at night, '), writerPage.keyboard.type(' The clock ticks.')]);
    for (const page of [ownerPage, writerPage]) {
      await expect(line(page)).toContainText(/^Late at night, .*The clock ticks\.$/, { timeout: 20_000 });
    }
    await expect(ownerPage.getByText('An edit overlaps a change from another writer.')).toHaveCount(0);
    expect(faults).toEqual([]);
  } finally {
    await ownerContext.close();
    await writerContext.close();
  }
});

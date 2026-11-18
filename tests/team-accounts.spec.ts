import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, loadDemo, manuscript, test } from './support/browser';
import { createWorkspaceInvitation } from '../server/team-invitations';
import { startTeamServer } from './support/team-server';
import type { TeamServer } from './support/team-server';

// Runs the built app against the real /api/team handler and a real PostgreSQL (embedded unless
// SWDR_TEST_DATABASE_URL is set). Requires `npm run build`. SWDR_TEAM_SCREENSHOTS=1 refreshes
// docs/screenshots/team-*.png.

const shots = process.env.SWDR_TEAM_SCREENSHOTS === '1';
const owner = { name: 'Olive Owner', email: 'olive@harbour.test', password: 'the ferry leaves at dawn' };
const writer = { name: 'Wes Writer', email: 'wes@harbour.test', password: 'paper tickets only 1987' };

let server: TeamServer;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  server = await startTeamServer({ signup: 'invite' });
});
test.afterAll(async () => { await server?.stop(); });

async function context(browser: Browser): Promise<BrowserContext> {
  const created = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block', baseURL: server.origin
  });
  await created.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.origin });
  return created;
}

async function capture(page: Page, name: string) {
  if (!shots) return;
  const directory = resolve(import.meta.dirname, '../docs/screenshots');
  await mkdir(directory, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(directory, `team-${name}.png`) });
}

async function api<T>(page: Page, action: string, body: Record<string, unknown> = {}) {
  return page.evaluate(async ([name, fields]) => {
    const response = await fetch('/api/team', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, action: name })
    });
    return { status: response.status, body: await response.json() as { data?: unknown; error?: string } };
  }, [action, body] as const) as Promise<{ status: number; body: { data?: T; error?: string } }>;
}

test('an owner signs up, shares a series, invites a scoped writer, changes the role and removes access', async ({ browser }) => {
  test.setTimeout(180_000);
  const faults: string[] = [];
  const ownerContext = await context(browser);
  const writerContext = await context(browser);
  try {
    const ownerPage = await ownerContext.newPage();
    const writerPage = await writerContext.newPage();
    for (const page of [ownerPage, writerPage]) page.on('pageerror', error => faults.push(error.message));

    // Invite-only workspace: a plain visit offers sign-in, and account creation needs an invitation.
    await ownerPage.goto('/#team');
    await expect(ownerPage.getByRole('heading', { name: 'SWDR team workspace' })).toBeVisible();
    await expect(ownerPage.getByText('This workspace is invite-only.')).toBeVisible();
    await capture(ownerPage, 'sign-in');
    await ownerPage.getByRole('tab', { name: 'Create account' }).click();
    await expect(ownerPage.getByText('Accounts are by invitation')).toBeVisible();

    // Bootstrap: the operator command issues the first owner's workspace invitation.
    const bootstrap = await createWorkspaceInvitation(server.database, owner.email, 'workspace operator');
    await ownerPage.goto('/');
    await loadDemo(ownerPage);
    await ownerPage.goto(`/#team?invite=${bootstrap.token}`);
    await expect(ownerPage.getByRole('heading', { name: 'Create your SWDR team account' })).toBeVisible();
    await expect(ownerPage.getByRole('textbox', { name: 'Email' })).toHaveValue(owner.email);
    await ownerPage.getByRole('textbox', { name: 'Your name' }).fill(owner.name);
    await ownerPage.getByRole('textbox', { name: 'Password' }).fill('too short');
    await ownerPage.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(ownerPage.getByText('Use at least 10 characters for your password.')).toBeVisible();
    await ownerPage.getByRole('textbox', { name: 'Password' }).fill(owner.password);
    await ownerPage.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(ownerPage.getByRole('heading', { name: 'Team projects' })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: owner.name })).toBeVisible();
    expect(ownerPage.url()).not.toContain(bootstrap.token);

    // Create a team copy of the local demo series.
    await ownerPage.getByLabel('Share a local project').selectOption({ label: 'The North Shore' });
    await ownerPage.getByRole('button', { name: 'Create private copy' }).click();
    await expect(ownerPage.getByText('Team synced')).toBeVisible({ timeout: 15_000 });

    // Invite a writer scoped to one episode and copy the link.
    await ownerPage.getByRole('button', { name: 'Team & sharing' }).click();
    const sharing = ownerPage.getByRole('region', { name: 'Team and sharing' });
    await expect(sharing.getByText(`${owner.name} (you)`)).toBeVisible();
    await sharing.getByRole('button', { name: 'Invite people' }).click();
    const inviteDialog = ownerPage.getByRole('dialog', { name: 'Invite people' });
    await inviteDialog.getByRole('textbox', { name: 'Email' }).fill(writer.email);
    await expect(inviteDialog.getByRole('combobox', { name: 'Role' })).toContainText('Writer');
    await inviteDialog.getByRole('combobox', { name: 'Access to' }).click();
    await ownerPage.getByRole('option', { name: /Selected episodes/ }).click();
    await inviteDialog.getByRole('checkbox', { name: 'S1 · E1 · The Last Boat' }).uncheck();
    await inviteDialog.getByRole('checkbox', { name: 'S1 · E4 · Doubt' }).check();
    await capture(ownerPage, 'invite-dialog');
    await inviteDialog.getByRole('button', { name: 'Create invitation link' }).click();
    const linkDialog = ownerPage.getByRole('dialog', { name: 'Copy the link and send it' });
    await expect(linkDialog.getByText('SWDR has no email service')).toBeVisible();
    const link = await linkDialog.getByRole('textbox', { name: 'Invitation link' }).inputValue();
    expect(link).toMatch(new RegExp(`^${server.origin}/#team\\?invite=[A-Za-z0-9_-]{43}$`));
    await linkDialog.getByRole('button', { name: 'Copy link' }).click();
    await expect(linkDialog.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await ownerPage.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await linkDialog.getByRole('button', { name: 'Done' }).click();
    const pending = sharing.getByRole('table').nth(1);
    await expect(pending.getByRole('row', { name: new RegExp(writer.email) })).toContainText('Writer');
    await expect(pending.getByRole('row', { name: new RegExp(writer.email) })).toContainText('S1 · E4 Doubt');

    // The writer opens the link in a separate browser profile and creates an account through it.
    await writerPage.goto(link);
    await expect(writerPage.getByRole('heading', { name: 'Join The North Shore as Writer' })).toBeVisible();
    await expect(writerPage.getByText(`${owner.name} invited ${writer.email}`)).toBeVisible();
    await expect(writerPage.getByText('Episodes: S1 · E4 · Doubt')).toBeVisible();
    await expect(writerPage.getByRole('tab', { name: 'Create account', selected: true })).toBeVisible();
    await capture(writerPage, 'accept-invite');
    await writerPage.getByRole('textbox', { name: 'Your name' }).fill(writer.name);
    await writerPage.getByRole('textbox', { name: 'Password' }).fill(writer.password);
    await writerPage.getByRole('button', { name: 'Create account and join' }).click();

    // Only the shared project, and only the granted episode.
    await expect(writerPage.getByText('Team synced')).toBeVisible({ timeout: 15_000 });
    await expect(writerPage.locator('.team-heading')).toHaveText('The North Shore');
    const documents = writerPage.locator('.team-editor-tools label', { hasText: 'Document' }).locator('select');
    await expect(documents.locator('option')).toHaveText(['Doubt']);
    const listed = await api<Array<{ title: string; role: string }>>(writerPage, 'list');
    expect(listed.body.data?.map(item => [item.title, item.role])).toEqual([['The North Shore', 'editor']]);
    await expect(writerPage.getByRole('button', { name: 'Team & sharing' })).toHaveCount(0);
    const editor = manuscript(writerPage);
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.locator('.swdr-el').last().click();
    await writerPage.keyboard.press('End');
    await writerPage.keyboard.type(' Wes was here.');
    await expect(writerPage.getByText('Team synced')).toBeVisible({ timeout: 15_000 });
    const head = await api<{ project: { documents: Array<{ blocks: Array<{ text: string }> }> } }>(ownerPage, 'open', {
      projectId: (await api<Array<{ id: string }>>(writerPage, 'list')).body.data?.[0].id
    });
    expect(JSON.stringify(head.body.data?.project.documents)).toContain('Wes was here.');

    // The owner makes the writer a viewer: the writer's copy turns read-only and the server refuses edits.
    const writerRow = sharing.getByRole('table').first().getByRole('row', { name: new RegExp(writer.email) });
    await expect(writerRow).toContainText(writer.name);
    await expect(writerRow).toContainText('Just now');
    await sharing.getByRole('button', { name: 'Invite people' }).click();
    await inviteDialog.getByRole('textbox', { name: 'Email' }).fill('rae@harbour.test');
    await inviteDialog.getByRole('combobox', { name: 'Role' }).click();
    await ownerPage.getByRole('option', { name: /^Reviewer/ }).click();
    await inviteDialog.getByRole('button', { name: 'Create invitation link' }).click();
    await linkDialog.getByRole('button', { name: 'Done' }).click();
    await expect(pending.getByRole('row', { name: /rae@harbour.test/ })).toContainText('Reviewer');
    await expect(pending.getByRole('row', { name: /rae@harbour.test/ })).toContainText('Whole project');
    await expect(pending.getByRole('row', { name: new RegExp(writer.email) })).toHaveCount(0);
    await capture(ownerPage, 'sharing');
    await writerRow.getByRole('combobox', { name: `Role for ${writer.email}` }).click();
    await ownerPage.getByRole('option', { name: /^Viewer/ }).click();
    await expect(writerRow.getByRole('combobox', { name: `Role for ${writer.email}` })).toContainText('Viewer');
    await expect(writerPage.getByText('Your project access changed.')).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    const projectId = (await api<Array<{ id: string }>>(writerPage, 'list')).body.data?.[0].id;
    const current = await api<{ project: unknown; version: number }>(writerPage, 'open', { projectId });
    const refused = await api(writerPage, 'save', {
      projectId, project: current.body.data?.project, version: current.body.data?.version, operationId: 'viewer-write',
      expectedRole: 'viewer', expectedEpisodeIds: null
    });
    expect(refused.status).toBe(403);

    // Remove access with confirmation; the writer's cached copy is withdrawn on the next sync.
    await writerRow.getByRole('button', { name: 'Remove' }).click();
    const confirm = ownerPage.getByRole('alertdialog', { name: `Remove ${writer.name}?` });
    await confirm.getByRole('button', { name: 'Remove access' }).click();
    await expect(sharing.getByRole('table').first().getByRole('row', { name: new RegExp(writer.email) })).toHaveCount(0);
    await expect(writerPage.getByText('Project unavailable.')).toBeVisible({ timeout: 15_000 });
    expect((await api<unknown[]>(writerPage, 'list')).body.data).toEqual([]);
    expect((await api(writerPage, 'open', { projectId })).status).toBe(404);

    // Sign out from the account menu ends the session on the server.
    await writerPage.getByRole('button', { name: writer.name }).click();
    await writerPage.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(writerPage.getByRole('tab', { name: 'Sign in' })).toBeVisible();
    expect((await api(writerPage, 'session')).status).toBe(401);
    expect(faults).toEqual([]);
  } finally {
    await ownerContext.close();
    await writerContext.close();
  }
});

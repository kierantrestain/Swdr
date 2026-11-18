import { expect, loadDemo, test } from './support/browser';
import type { Page } from '@playwright/test';
import { expectPassage } from './story-passage';

async function openSeries(page: Page) {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await page.getByRole('button', { name: /^Series Intelligence/ }).click();
  await expect(page.getByRole('heading', { name: 'Series Intelligence', exact: true })).toBeVisible();
  await page.getByLabel('Season').selectOption({ label: 'All seasons' });
}

test('maps every character across 24 episodes and opens an interaction at its exact script line', async ({ page, pageFaults }, testInfo) => {
  await openSeries(page);
  const workspaces = page.getByRole('navigation', { name: 'Series workspaces' });
  await workspaces.getByRole('button', { name: 'Story map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Story map', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^S[12]E\d\d .*: show every record$/ })).toHaveCount(24);
  await expect(page.getByRole('button', { name: /^Open .* dossier$/ })).toHaveCount(7);

  const first = page.getByRole('button', { name: /^Nora Vale in S1E01 / });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /^Nora Vale in S1E02 / })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /in S1E02 /);
  await expect(page.locator(':focus')).not.toHaveAttribute('aria-label', /^Nora Vale/);

  const cell = page.getByRole('button', { name: /^Elias Crowe in S1E04 .*1 interaction.*introduced/ });
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Elias Crowe · S1E04', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('story-map-1440x900.png'), animations: 'disabled' });
  const interaction = page.locator('.swdr-story-map-detail li').filter({ hasText: 'Elias changes the date on the timetable' });
  await interaction.getByRole('button', { name: /S1E04 · Scene 1 · Line 9/ }).click();
  await expectPassage(page, 'The timetable they sent you is for tomorrow.', { readOnly: true });
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
  expect(pageFaults).toEqual([]);
});

test('follows a relationship through its turns from the web and the dossier to the exact passage', async ({ page, pageFaults }) => {
  await openSeries(page);
  await page.getByRole('button', { name: 'Whole cast', exact: true }).click();
  const web = page.getByRole('group', { name: 'Relationship web for the whole cast' });
  await expect(web.locator('.swdr-story-node')).toHaveCount(7);
  await expect(web.getByRole('button', { name: /^Ines Calder Inquiry chair · 2 links/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nora Vale and Elias Crowe: Trust. Show relationship history' }).click();
  const history = page.getByRole('complementary', { name: 'Relationship history' });
  await expect(history.getByText('Elias withdraws the notebook', { exact: true })).toBeVisible();
  await expect(history.getByText('S1E05 · from Trust', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Close relationship history' }).click();

  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: 'Open dossier for Nora Vale' }).click();
  await expect(page.getByRole('heading', { name: 'Nora Vale', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Relationships', exact: true }).click();
  const chain = page.getByRole('list', { name: 'Relationship with Elias Crowe over time' });
  await expect(chain.getByRole('listitem')).toHaveCount(3);
  await chain.getByRole('button', { name: /^S1E05$/ }).click();
  await expectPassage(page, 'Elias closes his notebook and steps back from the investigation.', { readOnly: true });
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
  expect(pageFaults).toEqual([]);
});

test('keeps draft records and generated checks visibly apart from approved canon', async ({ page, pageFaults }, testInfo) => {
  await openSeries(page);
  const workspaces = page.getByRole('navigation', { name: 'Series workspaces' });
  await workspaces.getByRole('button', { name: 'Story map', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Nora Vale in S2E11 .*: no records$/ })).toBeVisible();
  await page.getByLabel('Canon or draft').selectOption('draft');
  await expect(page.getByText(/4 records not yet approved as canon/)).toBeVisible();
  const draftCell = page.getByRole('button', { name: /^Nora Vale in S2E11 .*includes draft records not in canon$/ });
  await draftCell.click();
  await expect(page.locator('.swdr-story-map-detail').getByText('Draft · not in canon').first()).toBeVisible();

  await workspaces.getByRole('button', { name: 'Arcs and continuity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arc timeline', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Answered question: Who travelled under the unmarked ticket\?, from S1E04 to S2E11$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open question: Were the ministry minutes edited before release\?/ })).toBeVisible();
  await expect(page.getByText('Generated · not canon', { exact: true })).toBeVisible();
  await expect(page.getByText('Nora Vale and Elias Crowe: Trust → Distance off screen', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('story-arcs-1440x900.png'), animations: 'disabled', fullPage: true });

  await workspaces.getByRole('button', { name: 'Event ledger', exact: true }).click();
  await page.getByRole('button', { name: 'Story time', exact: true }).click();
  await expect(page.getByRole('img', { name: /revealed out of story order/ })).toBeVisible();
  const ledger = page.locator('.swdr-story-rows > li');
  await expect(ledger.first()).toContainText('Jonah produces the original');
  await expect(ledger.first()).toContainText('Revealed out of order');
  expect(pageFaults).toEqual([]);
});

test('verifies factual claims by status and opens the exact host line and its segment', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
  await page.getByRole('button', { name: 'Open The Price of Progress', exact: true }).click();
  await page.getByRole('navigation', { name: 'Editorial workspaces' }).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Claim verification', exact: true })).toBeVisible();
  for (const [lane, claim] of [
    ['Unsourced', 'Residents were not told when the consultation closed.'],
    ['Sourced', 'The revised forecast doubled the original cost.'],
    ['Verified', 'The committee examined three costed alternatives before the vote.'],
    ['Disputed', 'The scheme was approved before the consultation closed.']
  ]) {
    await expect(page.getByRole('region', { name: `${lane} claims` }).getByRole('article', { name: claim })).toBeVisible();
  }
  const disputed = page.getByRole('article', { name: 'The scheme was approved before the consultation closed.' });
  await expect(disputed).toContainText('Not linked to a script line');
  const verified = page.getByRole('article', { name: 'The committee examined three costed alternatives before the vote.' });
  await expect(verified).toContainText('Used in 24 episodes');
  await page.screenshot({ path: testInfo.outputPath('story-claims-1440x900.png'), animations: 'disabled' });

  await page.getByRole('article', { name: 'The revised forecast doubled the original cost.' })
    .getByRole('button', { name: 'Open Follow the money in S1E02' }).click();
  await expect(page.getByRole('heading', { name: 'Follow the money', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Case 2', level: 1 })).toBeVisible();

  await page.getByRole('navigation', { name: 'Editorial workspaces' }).getByRole('button', { name: 'Claims', exact: true }).click();
  await verified.getByRole('button', { name: /S1E01 · Scene 1 · Line 4/ }).click();
  await expectPassage(page, 'The committee examined three costed alternatives before the vote.');
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
  expect(pageFaults).toEqual([]);
});

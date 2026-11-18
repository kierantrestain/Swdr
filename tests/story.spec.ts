import { readFile } from 'node:fs/promises';
import { expect, loadDemo, test } from './support/browser';
import { expectPassage } from './story-passage';

test('filters a 24-episode series, exports spoiler-safe data and traces a dossier interaction to its line', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await expect(page.locator('.document-row')).toHaveCount(24);
  await page.getByRole('button', { name: /^Series Intelligence/ }).click();
  await expect(page.getByRole('heading', { name: 'Series Intelligence', exact: true })).toBeVisible();
  await expect(page.getByText('Approved canon · The North Shore', { exact: true })).toBeVisible();

  const asOf = page.getByLabel('As of episode');
  await asOf.selectOption({ label: 'As of S1E04' });
  await expect(page.getByRole('button', { name: 'Open character dossier' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('07-series-intelligence-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Open character dossier' }).click();
  await expect(page.getByRole('heading', { name: 'Nora Vale', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Key interactions', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('08-character-dossier-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Relationship web', exact: true }).click();

  await asOf.selectOption({ label: 'As of S1E03' });
  const exportEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export visible story', exact: true }).click();
  const exported = await (await exportEvent).path();
  if (!exported) throw new Error('Story export has no local file.');
  const spoilerSafe = await readFile(exported, 'utf8');
  expect(spoilerSafe).toContain('Jonah');
  expect(spoilerSafe).not.toContain('Elias');
  expect(spoilerSafe).not.toContain('The last departure');

  await asOf.selectOption({ label: 'As of S1E04' });
  await page.getByRole('button', { name: 'Open character dossier' }).click();
  const interaction = page.locator('article, li, div.swdr-story-line').filter({ hasText: 'Elias changes the date on the timetable' });
  const specificSource = page.getByRole('button', { name: /S1E04 · Scene 1 · Line 9/ });
  await expect(interaction.first()).toBeVisible();
  await specificSource.first().click();
  await expectPassage(page, 'The timetable they sent you is for tomorrow.', { readOnly: true });
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
  expect(pageFaults).toEqual([]);
});

test('corrects a claim in a 75-minute outline and downloads four files from the same reissued revision', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
  await expect(page.locator('.document-row')).toHaveCount(24);
  await page.getByRole('button', { name: 'Open The Price of Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Price of Progress', exact: true })).toBeVisible();
  await expect(page.getByText(/75-minute outline/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('09-editorial-1440x900.png'), animations: 'disabled' });

  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.locator('.swdr-editorial-resource').filter({ hasText: 'three costed alternatives' })
    .getByRole('button', { name: 'Correct claim', exact: true }).click();
  await page.getByRole('textbox', { name: /^Exact claim/ }).fill('The committee compared two costed alternatives before the vote.');
  await page.getByLabel('Reason for correction').fill('One option had no cost schedule.');
  await page.getByRole('button', { name: 'Save claim', exact: true }).click();
  await page.getByRole('button', { name: 'Issues', exact: true }).click();
  await expect(page.getByText('Reissue after source corrections', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Issue outputs', exact: true }).click();
  await expect(page.getByText('Reissue after source corrections', { exact: true })).toHaveCount(0);

  const revisions = new Set<string>();
  const titles = ['Research dossier', 'Host guide', 'Producer rundown', 'Graphics and asset register'];
  for (const title of titles) {
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const downloadStarted = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toContain('issue-2');
    const path = await download.path();
    if (!path) throw new Error('Issued output has no local file.');
    const content = await readFile(path, 'utf8');
    expect(content).toContain(`# ${title}`);
    const revision = /Editorial revision (\S+)/.exec(content)?.[1];
    expect(revision).toBeTruthy();
    revisions.add(revision!);
    if (title === 'Research dossier') expect(content).toContain('two costed alternatives');
  }
  expect(revisions.size).toBe(1);
  expect(pageFaults).toEqual([]);
});

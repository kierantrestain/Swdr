import { expect, openHome, test } from './support/browser';

const makeFountain = (slug: string, speaker: string, line: string) =>
  `${slug}\n\nRain hammers the stone pier.\n\n${speaker}\n${line}\n`;

test('uploads a multi-episode series out of order, auto-sorts, files into season folders, and opens Series Intelligence', async ({ page, pageFaults }, testInfo) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Upload series', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose episode scripts' })).toBeVisible();

  const input = page.getByLabel('Choose series scripts');
  await input.setInputFiles([
    {
      name: 'Harbour Watch - S01E03 - Storm.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from(makeFountain('EXT. HARBOUR - NIGHT', 'MARA', 'The gale took the beacon.'))
    },
    {
      name: 'Harbour Watch - S01E01 - Pilot.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from(makeFountain('EXT. FERRY DOCK - DAWN', 'MARA', 'First boat in is never empty.'))
    },
    {
      name: 'Harbour Watch - S01E02 - Crossing.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from(makeFountain('INT. WHEELHOUSE - DAY', 'JONAH', 'Check the compass again.'))
    }
  ]);

  await expect(page.getByRole('heading', { name: 'Organise series upload' })).toBeVisible();
  await expect(page.getByLabel('Series or project title')).toHaveValue('Harbour Watch');

  // Verify auto-sorted natural order S1E01 -> S1E02 -> S1E03
  const orderBadges = page.locator('.batch-order-index');
  await expect(orderBadges).toHaveText(['S1E01', 'S1E02', 'S1E03']);
  await page.screenshot({ path: testInfo.outputPath('series-upload-staging.png'), animations: 'disabled' });

  await page.getByRole('button', { name: 'Import 3 episodes' }).click();
  await expect(page.getByRole('heading', { name: 'Harbour Watch', exact: true })).toBeVisible();

  const rows = page.locator('.document-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Pilot');
  await expect(rows.nth(1)).toContainText('Crossing');
  await expect(rows.nth(2)).toContainText('Storm');

  // Season 1 folder was automatically created
  await expect(page.getByRole('button', { name: /^Season 1/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('series-overview-after-upload.png'), animations: 'disabled' });

  // Series Intelligence opens with the imported episodes connected
  await page.getByRole('button', { name: /Series Intelligence/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Series Intelligence' })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('scaffolds a series, builds Season 2 with custom titles, and reorders episodes', async ({ page, pageFaults }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('North Pier');
  await dialog.getByRole('combobox', { name: /Format/ }).click();
  await page.getByRole('option', { name: /^Television/ }).click();
  await dialog.getByRole('button', { name: '6 eps', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Create a folder for each season' }).check();
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'North Pier', exact: true })).toBeVisible();
  await expect(page.locator('.document-row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: /^Season 1/ })).toBeVisible();

  // Build Season 2 with 2 custom episode titles
  await page.getByRole('button', { name: 'Build season', exact: true }).click();
  const seasonDialog = page.getByRole('dialog');
  await seasonDialog.getByLabel('Season number').fill('2');
  await seasonDialog.getByLabel('Number of episodes').fill('2');
  await seasonDialog.getByLabel('Episode titles (optional, one per line)').fill('Low Tide\nHigh Water');
  await seasonDialog.getByRole('button', { name: 'Create 2 episodes', exact: true }).click();

  // Build season automatically selects Season 2 and creates the Season 2 folder
  await expect(page.getByRole('button', { name: /^Season 2/ })).toBeVisible();
  const s2Rows = page.locator('.document-row');
  await expect(s2Rows).toHaveCount(2);
  await expect(s2Rows.nth(0)).toContainText('Low Tide');
  await expect(s2Rows.nth(1)).toContainText('High Water');

  await page.getByRole('button', { name: 'Move High Water up' }).click();
  await expect(s2Rows.nth(0)).toContainText('High Water');
  await expect(s2Rows.nth(1)).toContainText('Low Tide');
  expect(pageFaults).toEqual([]);
});

test('creates folders, files and reorders scripts, renames and deletes a folder without losing scripts', async ({ page, pageFaults }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Anthology Slate');
  // Film is the default format in New project
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();

  // Navigate to Project Overview
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Anthology Slate', exact: true })).toBeVisible();

  // Create a folder
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  const folderDialog = page.getByRole('dialog');
  await folderDialog.getByLabel('Folder name').fill('Rewrites');
  await folderDialog.getByRole('button', { name: 'Create folder', exact: true }).click();

  // Add two more scripts and file them into Rewrites
  for (const name of ['Second Draft', 'Third Draft']) {
    await page.getByRole('button', { name: 'New document', exact: true }).click();
    const docDialog = page.getByRole('dialog');
    await docDialog.getByLabel('Title').fill(name);
    await docDialog.getByRole('combobox', { name: /Folder/ }).click();
    await page.getByRole('option', { name: 'Rewrites' }).click();
    await docDialog.getByRole('button', { name: 'Create', exact: true }).click();
    // Return to Overview after creating the script
    await page.getByRole('link', { name: 'Overview' }).click();
  }

  // Filter to Rewrites folder and reorder Third Draft above Second Draft
  await page.getByRole('button', { name: /^Rewrites/ }).click();
  const rows = page.locator('.document-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Second Draft');
  await expect(rows.nth(1)).toContainText('Third Draft');

  await page.getByRole('button', { name: 'Move Third Draft up' }).click();
  await expect(rows.nth(0)).toContainText('Third Draft');
  await expect(rows.nth(1)).toContainText('Second Draft');

  // Rename folder
  await page.getByRole('button', { name: 'Rename folder', exact: true }).click();
  const renameDialog = page.getByRole('dialog');
  await renameDialog.getByLabel('Folder name').fill('Final Polish');
  await renameDialog.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Final Polish/ })).toBeVisible();

  // Delete folder — all 3 scripts remain safely in the project
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click();
  await expect(page.locator('.document-row')).toHaveCount(3);
  expect(pageFaults).toEqual([]);
});

import { expect, loadDemo, test } from './support/browser';

test('resolves a cast clash, verifies costs and issues an acknowledged and reissued call sheet', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await page.getByRole('button', { name: /^Production From released script/ }).click();
  await expect(page.getByRole('heading', { name: 'Shooting stripboard' })).toBeVisible();
  await expect(page.getByText(/Elias is unavailable/i)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('10-stripboard-1440x900.png'), animations: 'disabled' });

  await page.getByRole('button', { name: 'Edit scheduled scene 1', exact: true }).click();
  const day = page.getByRole('combobox', { name: /^Shoot day/ });
  await day.selectOption({ index: 1 });
  await page.getByLabel('Start time', { exact: true }).fill('09:30');
  await page.getByRole('button', { name: 'Save scheduled scene', exact: true }).click();
  await expect(page.getByText(/schedule conflict/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Day out of days', exact: true }).click();
  const nora = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Nora', exact: true }) });
  await expect(nora).toContainText('SW');
  await expect(nora).toContainText('WF');
  await expect(nora.getByRole('cell').last()).toHaveText('2');
  await page.getByRole('button', { name: 'Budget', exact: true }).click();
  await expect(page.getByText('£515.00', { exact: true })).toBeVisible();
  await expect(page.getByText('£465.00', { exact: true })).toBeVisible();
  await expect(page.getByText('£50.00', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Call sheets', exact: true }).click();
  await page.getByRole('combobox', { name: /^Shoot day/ }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Preview call sheet', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Preview call sheet V1' })).toBeVisible();
  await page.getByRole('button', { name: 'Issue call sheet', exact: true }).click();
  const issued = page.getByRole('dialog', { name: 'Issued call sheet V1' });
  await expect(issued).toBeVisible();
  await issued.getByRole('button', { name: 'Send test', exact: true }).first().click();
  await issued.getByRole('button', { name: 'Acknowledge test', exact: true }).click();
  await expect(issued.getByText('Acknowledged', { exact: true })).toBeVisible();
  await issued.getByRole('button', { name: 'Close preview', exact: true }).click();
  await page.getByRole('button', { name: 'Preview call sheet', exact: true }).click();
  await page.getByRole('button', { name: 'Reissue call sheet', exact: true }).click();
  const reissue = page.getByRole('dialog', { name: 'Issued call sheet V2' });
  await expect(reissue).toBeVisible();
  await reissue.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(page.getByText(/Superseded · 1\/1 acknowledged/)).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('reimports a moved and omitted shooting draft before applying the production links', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await page.getByRole('button', { name: 'Import draft', exact: true }).click();
  const script = [
    'EXT. HARBOUR WALL – DAWN', 'Jonah opens the amended log.',
    'INT. FERRY OFFICE – NIGHT', 'Nora compares the last two tickets.',
    'EXT. DOCKS – NIGHT', 'A new boat enters the docks.'
  ].join('\n\n');
  await page.getByLabel('Choose script files').setInputFiles({
    name: 'Doubt revised.fountain', mimeType: 'text/plain', buffer: Buffer.from(script)
  });
  const destination = page.getByRole('combobox', { name: /^Draft destination/ });
  await destination.selectOption({ label: 'Reimport Doubt' });
  await expect(page.getByRole('heading', { name: 'Reconcile scenes', exact: true })).toBeVisible();
  await expect(page.getByText(/Omitted scenes:.*FERRY TERMINAL/i)).toBeVisible();
  await page.getByRole('button', { name: 'Import draft', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();

  await page.getByRole('button', { name: 'The North Shore', exact: true }).click();
  await page.getByRole('button', { name: /^Production From released script/ }).click();
  await page.getByRole('button', { name: 'Script revisions', exact: true }).click();
  await page.getByRole('button', { name: 'Issue and review', exact: true }).click();
  await expect(page.getByText(/Moved/).first()).toBeVisible();
  await expect(page.getByText(/EXT\. DOCKS/).filter({ visible: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Incoming source for scene 2', exact: true }).selectOption('__omit__');
  await page.getByRole('button', { name: 'Apply reviewed revision', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Shooting Draft 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Shots & storyboard', exact: true }).click();
  await page.getByRole('combobox', { name: /^Scene/ }).selectOption({ label: '2 · INT. FERRY OFFICE – NIGHT' });
  await expect(page.getByRole('heading', { name: /The ferry ticket crosses the desk/ })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

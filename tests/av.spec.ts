import { expect, loadDemo, test } from './support/browser';

test('reorders and retimes a sixty-second AV cut and opens a twenty-minute rehearsal', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project Night Signal' }).click();
  await page.getByRole('button', { name: 'Open Sixty-second cut', exact: true }).click();
  await expect(page.getByText('Runtime 01:00', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('05-av-1440x900.png'), animations: 'disabled' });
  const first = page.getByRole('textbox', { name: 'Cue 1 video' });
  const second = page.getByRole('textbox', { name: 'Cue 2 video' });
  const originalFirst = await first.inputValue();
  const originalSecond = await second.inputValue();
  await page.getByRole('button', { name: 'Edit timing for cue 1' }).click();
  await page.getByRole('button', { name: 'Move cue down', exact: true }).click();
  await expect(first).toHaveValue(originalSecond);
  await expect(second).toHaveValue(originalFirst);
  await expect(page.getByText('Runtime 01:00', { exact: true })).toBeVisible();
  const cue = page.getByRole('button', { name: 'Edit timing for cue 1' });
  await cue.click();
  await page.getByLabel('Start override (seconds)').fill('5');
  await expect(page.getByText('Runtime 01:05', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Night Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Open Twenty-minute rehearsal', exact: true }).click();
  await expect(page.getByText('Runtime 20:00', { exact: true })).toBeVisible();
  await expect(page.getByText('20 cues', { exact: true })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

import { test, expect, loadDemo } from './support/browser';

test('script tools report characters, check formatting, cast a table read and track a daily goal', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await page.getByRole('button', { name: /Script tools/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Script tools' });

  const report = dialog.getByRole('region', { name: 'Script report' });
  await expect(report.getByRole('row', { name: /^JONAH 1 10/ })).toBeVisible();
  await expect(report.getByRole('region', { name: 'Locations' })).toContainText('FERRY OFFICE');

  await dialog.getByRole('tab', { name: /Checks/ }).click();
  await expect(dialog.getByText('Formatting looks clean')).toBeVisible();

  await dialog.getByRole('tab', { name: 'Table read' }).click();
  await expect(dialog.getByRole('group', { name: 'Read aloud' }).getByLabel('Character names')).not.toBeChecked();

  await dialog.getByRole('tab', { name: 'Goals' }).click();
  await dialog.getByLabel('Daily word goal').fill('500');
  await dialog.getByRole('button', { name: 'Set goal' }).click();
  await expect(dialog.getByText("0% of today's goal")).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Script tools 0\/500/ })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

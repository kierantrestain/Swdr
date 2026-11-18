import type { Locator, Page } from '@playwright/test';
import { expect, loadDemo, test } from './support/browser';

async function openProduction(page: Page) {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await page.getByRole('button', { name: /^Production From released script/ }).click();
  await expect(page.getByRole('heading', { name: 'Shooting stripboard' })).toBeVisible();
}

function strips(day: Locator) {
  return day.getByRole('listitem', { name: /^Scene \d+,/ });
}

test('schedules strips by keyboard, menu and drag and drop, and the call sheet follows', async ({ page, pageFaults }, testInfo) => {
  await openProduction(page);
  await expect(page.getByRole('list', { name: 'Strip colours' })).toContainText('EXT · Night');
  const dayOne = page.getByRole('region', { name: 'Day 1 · Ferry terminal' });
  const dayTwo = page.getByRole('region', { name: 'Day 2 · Harbour wall' });
  const pool = page.getByRole('complementary', { name: 'Unscheduled scenes' });
  await expect(strips(dayOne)).toHaveCount(2);
  await expect(strips(dayOne).first()).toHaveAccessibleName(/^Scene 1, .*15:00$/);
  await expect(dayOne.getByText('Company move to Terminal ramp')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('stripboard-strips-1440x900.png'), animations: 'disabled' });

  const grip = page.getByRole('button', { name: 'Reorder scene 2', exact: true });
  await grip.focus();
  await grip.press('ArrowUp');
  await expect(strips(dayOne).first()).toHaveAccessibleName(/^Scene 2, .*15:00$/);
  await expect(strips(dayOne).nth(1)).toHaveAccessibleName(/^Scene 1, .*15:45$/);
  await expect(page.getByRole('button', { name: 'Reorder scene 2', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Move scene 3', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Return to unscheduled', exact: true }).click();
  await expect(strips(dayTwo)).toHaveCount(0);
  const pooled = pool.getByRole('listitem', { name: /^Unscheduled scene 3,/ });
  await expect(pooled).toBeVisible();

  await pooled.dragTo(dayOne.getByRole('list'), { targetPosition: { x: 40, y: 4 } });
  await expect(strips(dayOne)).toHaveCount(3);
  await expect(strips(dayOne).first()).toHaveAccessibleName(/^Scene 3, EXT\. HARBOUR WALL – DAWN, 15:00$/);
  await expect(pool.getByText('Every active scene is on the schedule.')).toBeVisible();

  await strips(dayOne).first().dragTo(dayTwo.getByRole('list'));
  await expect(strips(dayTwo)).toHaveCount(1);
  await expect(strips(dayTwo).first()).toHaveAccessibleName(/^Scene 3, .*07:00$/);

  await page.waitForTimeout(400);
  await page.reload();
  await expect(strips(page.getByRole('region', { name: 'Day 1 · Ferry terminal' })).first()).toHaveAccessibleName(/^Scene 2, .*15:00$/);

  await page.getByRole('button', { name: 'Call sheets', exact: true }).click();
  await page.getByRole('button', { name: 'Preview call sheet', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Preview call sheet V1' });
  await expect(sheet.getByText('Call sheet · Day 1 of 2')).toBeVisible();
  await expect(sheet.getByText(/North Shore General/)).toBeVisible();
  const rows = sheet.getByRole('table').first().getByRole('row');
  await expect(rows.nth(1)).toContainText('2');
  await expect(rows.nth(1)).toContainText('EXT. FERRY TERMINAL');
  await expect(rows.nth(2)).toContainText('1, 2');
  const castTable = sheet.getByRole('table').nth(1);
  await expect(castTable.getByRole('row', { name: /^1 Nora Nora Vale 15:00$/ })).toBeVisible();
  await expect(castTable.getByRole('row', { name: /^2 Elias Elias Crowe 15:45$/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Download CSV', exact: true })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('flags script changes made after release on strips and breakdown and opens the revision review', async ({ page, pageFaults }) => {
  await openProduction(page);
  const banner = page.getByRole('status').filter({ hasText: 'Script changed since Shooting Draft 1' });
  await expect(banner).toBeVisible();
  await page.getByRole('button', { name: 'Review script change for scene 1', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Script changes since release' });
  await expect(review).toContainText('1 · INT. FERRY OFFICE – NIGHT');
  await expect(review).toContainText('Day 1 · Mon, 18 Jan 2027 at 15:00');
  await review.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Breakdown sheet' })).toBeVisible();
  await expect(page.getByText('1. Nora', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review script change for scene 1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Script changes since release' }).getByRole('button', { name: 'Issue draft and review links' }).click();
  await expect(page.getByRole('dialog', { name: 'Production script revisions' })).toBeVisible();
  await page.getByRole('button', { name: 'Issue and review', exact: true }).click();
  await page.getByRole('button', { name: 'Apply reviewed revision', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Shooting Draft 2', exact: true })).toBeVisible();
  await expect(page.getByText('Script changed since', { exact: false })).toHaveCount(0);
  expect(pageFaults).toEqual([]);
});

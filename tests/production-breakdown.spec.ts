import type { Page } from '@playwright/test';
import { choose, expect, openHome, test } from './support/browser';
import { featureScript } from './support/feature-script';

const SCREENSHOTS = process.env.SWDR_SCREENSHOT_DIR;
test.use({ deviceScaleFactor: SCREENSHOTS ? 2 : 1 });

/** A small portrait PNG drawn in the page, so uploads go through the real resize path. */
async function portrait(page: Page, hue: number): Promise<Buffer> {
  const data = await page.evaluate(value => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 800;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 640, 800);
    gradient.addColorStop(0, `hsl(${value} 45% 62%)`);
    gradient.addColorStop(1, `hsl(${(value + 40) % 360} 40% 30%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 640, 800);
    context.fillStyle = `hsl(${value} 30% 88%)`;
    context.beginPath();
    context.arc(320, 300, 130, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(320, 760, 260, 230, 0, Math.PI, 0);
    context.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  }, hue);
  return Buffer.from(data, 'base64');
}

async function shot(page: Page, name: string, top = true) {
  if (!SCREENSHOTS) return;
  if (top) await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/production-v2-${name}.png`, animations: 'disabled' });
}

test('builds cast, locations and page counts from an imported film script, then carries cast photos to the call sheet', async ({ page, pageFaults }) => {
  test.setTimeout(150_000);
  await openHome(page);
  await page.getByRole('button', { name: 'Import script', exact: true }).click();
  await page.getByLabel('Choose script files').setInputFiles({
    name: 'Blind Spot.fountain', mimeType: 'text/plain', buffer: Buffer.from(featureScript())
  });
  await expect(page.getByRole('heading', { name: 'Review script import' })).toBeVisible();
  await page.getByRole('button', { name: 'Import draft', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();

  const sections = page.getByRole('navigation', { name: 'Project sections' });
  await sections.getByRole('link', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Issue writing draft', exact: true }).click();
  await page.getByRole('button', { name: 'Issue script', exact: true }).click();

  const summary = page.getByText(/65 scenes over \d+ pages · 7 speaking roles/);
  await expect(summary).toBeVisible();

  await page.getByRole('radio', { name: /^Cast & crew/ }).click();
  const directory = page.getByRole('region', { name: 'Cast and crew directory' });
  const rows = directory.getByRole('table').first().getByRole('row');
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(1)).toContainText('Maya');
  await expect(directory.getByRole('button', { name: 'Open Mr. Hale', exact: true })).toBeVisible();
  await expect(directory).not.toContainText('(V.O.)');
  await expect(directory).not.toContainText('CONT');

  await directory.getByRole('button', { name: 'Open Maya', exact: true }).click();
  const person = page.getByRole('dialog', { name: 'Maya' });
  await person.getByLabel('Artist').fill('Ana Reyes');
  await person.getByLabel('Agent').fill('Northlight Talent · J. Okoye');
  await person.locator('input[type="file"]').setInputFiles({ name: 'maya.png', mimeType: 'image/png', buffer: await portrait(page, 18) });
  await expect(person.getByRole('img', { name: 'Maya' }).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await person.getByRole('button', { name: 'Save person', exact: true }).click();
  await expect(rows.nth(1)).toContainText('Ana Reyes');
  for (const [name, hue] of [['Ruth', 200], ['Daniel', 120]] as const) {
    await directory.getByRole('button', { name: `Open ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name });
    await dialog.locator('input[type="file"]').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: await portrait(page, hue) });
    await expect(dialog.getByRole('img', { name }).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
    await dialog.getByRole('button', { name: 'Close preview', exact: true }).click();
  }
  await shot(page, '1-cast');
  await page.getByRole('button', { name: 'Dismiss breakdown summary', exact: true }).click();

  await page.getByRole('radio', { name: /^Locations/ }).click();
  const locations = page.getByRole('region', { name: 'Locations directory' });
  await expect(locations.getByRole('table').getByRole('row')).toHaveCount(10);
  await expect(locations.getByRole('button', { name: "Open Maya's Apartment - Kitchen", exact: true })).toBeVisible();
  await locations.getByRole('button', { name: 'Open Marina', exact: true }).click();
  const marina = page.getByRole('dialog', { name: 'Marina' });
  await marina.locator('input[type="file"]').setInputFiles([
    { name: 'marina-1.png', mimeType: 'image/png', buffer: await portrait(page, 190) },
    { name: 'marina-2.png', mimeType: 'image/png', buffer: await portrait(page, 220) }
  ]);
  await expect(marina.getByRole('img', { name: /Marina recce photo/ })).toHaveCount(2);
  await marina.getByLabel('Address').fill('Marina Walk, Port Edgar, EH30 9SQ');
  await marina.getByRole('button', { name: 'Save location', exact: true }).click();
  await expect(locations).toContainText('Marina Walk, Port Edgar');

  await sections.getByRole('link', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Add shoot day', exact: true }).first().click();
  const day = page.getByRole('dialog', { name: 'Add shoot day' });
  await day.getByLabel('Day label').fill('Kitchen and marina');
  await day.getByLabel('Shoot date').fill('2027-03-01');
  const picker = day.getByRole('group', { name: 'Scenes for this day' });
  await picker.getByRole('checkbox').nth(0).check();
  await picker.getByRole('checkbox').nth(1).check();
  await expect(picker).toContainText('2 scenes');
  await expect(picker).toContainText(/Cast 1/);
  await shot(page, '3-shoot-day', false);
  await day.getByRole('button', { name: 'Save shoot day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Day 1 · Kitchen and marina' }).getByRole('listitem', { name: /^Scene \d+,/ })).toHaveCount(2);

  await sections.getByRole('link', { name: 'Call sheets', exact: true }).click();
  await page.getByRole('button', { name: 'Preview call sheet', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Preview call sheet V1' });
  const maya = sheet.getByRole('row', { name: /^1 Maya Ana Reyes/ });
  await expect(maya).toBeVisible();
  await expect(maya.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await sheet.getByRole('button', { name: 'Close preview', exact: true }).click();

  await sections.getByRole('link', { name: 'Budget', exact: true }).click();
  const top = page.getByRole('region', { name: 'Budget top sheet' });
  for (const name of ['Above the line', 'Below the line', 'Post-production', 'Other', 'Cast', 'Camera', 'Catering', 'Insurance']) {
    await expect(top.getByText(name, { exact: true })).toBeVisible();
  }
  await top.getByRole('button', { name: 'New cost line', exact: true }).click();
  await choose(page, /^Category/, '2100 · Camera');
  await page.getByLabel('Item name').fill('Camera package');
  await page.getByLabel('Quantity').fill('2');
  await page.getByLabel('Rate (£)').fill('450');
  await page.getByLabel('Units').fill('5');
  await page.getByLabel('Actual spend (£)').fill('3000');
  await page.getByRole('button', { name: 'Add cost line', exact: true }).click();
  await top.getByLabel('Contingency percentage').fill('10');
  await top.getByLabel('Contingency percentage').blur();
  await expect(top.getByText('£4,950.00', { exact: true })).toBeVisible();
  await expect(top.getByText('£1,950.00', { exact: true })).toBeVisible();
  await expect(top.getByRole('row', { name: /Grand total 4,950\.00 3,000\.00 1,950\.00/ })).toBeVisible();
  await shot(page, '2-budget');

  await sections.getByRole('link', { name: 'Sides', exact: true }).click();
  await choose(page, 'Select by shoot day', { index: 0 });
  await expect(page.getByText('2 of 65 scenes', { exact: true })).toBeVisible();
  await shot(page, '4-sides');
  expect(pageFaults).toEqual([]);
});

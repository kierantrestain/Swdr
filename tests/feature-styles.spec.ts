import { expect, loadDemo, test } from './support/browser';

/**
 * Lazily loaded sections must bring their own stylesheet. A section whose CSS
 * never loads still passes behaviour tests, but renders as one unstyled column.
 */
test('Series Intelligence and Editorial load their layout styles when opened directly', async ({ page, pageFaults }) => {
  await loadDemo(page);

  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await page.getByRole('button', { name: /^Series Intelligence/ }).click();
  const web = page.locator('.swdr-story-web-layout');
  await expect(web).toBeVisible();
  await expect(web).toHaveCSS('display', 'grid');
  await expect(page.locator('.swdr-story-card').first()).toHaveCSS('border-top-style', 'solid');

  await page.goto('/#home');
  await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
  await page.getByRole('button', { name: /^Editorial/ }).click();
  const editorial = page.locator('.swdr-editorial-layout');
  await expect(editorial).toBeVisible();
  await expect(editorial).toHaveCSS('display', 'grid');

  expect(pageFaults).toEqual([]);
});

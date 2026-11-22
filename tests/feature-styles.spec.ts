import { expect, loadDemo, test } from './support/browser';

/**
 * Lazily loaded sections must render their Astryx multi-column layouts and card
 * chrome when opened directly, rather than collapsing into an unstyled column.
 */
test('Series Intelligence and Editorial load their layout styles when opened directly', async ({ page, pageFaults }) => {
  await loadDemo(page);

  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await page.getByRole('button', { name: /^Series Intelligence/ }).click();
  const webRegion = page.getByRole('region', { name: 'Relationship web' });
  const inspector = page.getByRole('complementary', { name: 'Selected character' });
  await expect(webRegion).toBeVisible();
  await expect(inspector).toBeVisible();
  const webBox = await webRegion.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(webBox && inspectorBox && inspectorBox.x > webBox.x + 200).toBe(true);
  await expect(webRegion).toHaveCSS('border-top-style', 'solid');

  await page.goto('/#home');
  await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
  await page.getByRole('button', { name: /^Editorial Segments/ }).click();
  const segments = page.getByRole('region', { name: 'Episode segments' });
  const research = page.getByRole('region', { name: 'Research and evidence' });
  await expect(segments).toBeVisible();
  await expect(research).toBeVisible();
  const segBox = await segments.boundingBox();
  const resBox = await research.boundingBox();
  expect(segBox && resBox && resBox.x > segBox.x + 300).toBe(true);

  expect(pageFaults).toEqual([]);
});

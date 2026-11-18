import { test, expect, loadDemo } from './support/browser';
/** Visits every major page in light and dark and at phone width, failing on page errors, console errors or sideways scrolling. */
const dir = process.env.SWDR_SCREENSHOTS;
for (const mode of ['light', 'dark'] as const) {
  test(`every page renders cleanly in ${mode} mode`, async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('console', message => { if (message.type() === 'error' && !/api\/team|Failed to load resource/.test(message.text())) problems.push(`console: ${message.text()}`); });
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    await loadDemo(page);
    if (mode === 'dark') await page.getByRole('button', { name: 'Use dark appearance' }).click();
    const nav = () => page.getByRole('navigation', { name: 'Project sections' });
    const shot = async (name: string) => {
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 2) problems.push(`${name}: horizontal overflow ${overflow}px`);
      if (dir) await page.screenshot({ path: `${dir}/${mode}-${name}.png` });
    };
    await shot('01-home');
    await page.getByRole('button', { name: 'Open project Frame by Frame' }).click();
    await shot('05-creator-overview');
    await nav().getByRole('link', { name: /Creator studio/ }).click();
    await expect(page.getByRole('heading', { name: 'Creator studio' })).toBeVisible();
    await shot('02-creator');
    await page.getByRole('tab', { name: 'Publish' }).click();
    await shot('03-creator-publish');
    await page.getByRole('tab', { name: /Checks/ }).click();
    await shot('04-creator-checks');
    await page.getByRole('link', { name: 'Projects' }).first().click();
    await page.getByRole('button', { name: 'Open project The North Shore' }).click();
    await nav().getByRole('link', { name: 'Script', exact: true }).click();
    await shot('06-write');
    await nav().getByRole('link', { name: 'Outline' }).click();
    await shot('07-outline');
    await nav().getByRole('link', { name: 'Series Intelligence' }).click();
    await shot('08-story');
    await nav().getByRole('link', { name: 'Schedule', exact: true }).click();
    await page.getByRole('button', { name: 'Table', exact: true }).click().catch(() => undefined);
    await shot('09-schedule-table');
    for (const name of ['Schedule', 'Breakdown', 'Call sheets', 'Budget']) {
      await nav().getByRole('link', { name, exact: true }).click();
      await shot(`09-${name.toLowerCase().replace(/ /g, '-')}`);
    }
    await page.getByRole('link', { name: 'Projects' }).first().click();
    await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
    await nav().getByRole('link', { name: 'Editorial' }).click();
    await shot('10-editorial');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await shot('11-sign-in');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open project Frame by Frame' }).click();
    await page.goto(page.url().replace('/project', '/creator'));
    await shot('12-phone-creator');
    expect(problems).toEqual([]);
  });
}

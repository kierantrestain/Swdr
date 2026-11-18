import { expect, loadDemo, test } from './support/browser';

test.use({ serviceWorkers: 'allow' });

test('reopens a saved screenplay from the production service worker offline', async ({ context, page, pageFaults }) => {
  void pageFaults;
  await loadDemo(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const resources = await page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith('swdr-app-'));
    return name ? (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname) : [];
  });
  expect(resources).toEqual(expect.arrayContaining(['/index.html', '/manifest.webmanifest']));
  await context.route('**/*', route => route.abort('internetdisconnected'));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.swdr-pm .swdr-el[data-element=scene]').first()).toHaveText('INT. FERRY OFFICE – NIGHT');
});

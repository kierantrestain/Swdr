import { access } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const dist = process.env.SWDR_BROWSER_DIST;

export async function routeBuiltApp(context: BrowserContext, baseURL?: string): Promise<void> {
  if (!dist || !baseURL) return;
  const root = resolve(dist);
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const resource = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = resolve(root, `.${resource}`);
    if (!file.startsWith(root + sep)) return route.abort();
    try {
      await access(file);
      return await route.fulfill({ path: file });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
}

const browserTests = process.env.SWDR_RESTRICTED_BROWSER === '1'
  ? base.extend({
      context: async ({ playwright, browserName, launchOptions, baseURL, viewport, serviceWorkers }, use) => {
        // Single-process Chrome is stable when each test owns the browser process.
        const browser = await playwright[browserName].launch(launchOptions);
        try {
          const context = await browser.newContext({ baseURL, viewport, serviceWorkers });
          await routeBuiltApp(context, baseURL);
          await use(context);
        } finally {
          await browser.close();
        }
      }
    })
  : base.extend({
      context: async ({ context, baseURL }, use) => {
        await routeBuiltApp(context, baseURL);
        await use(context);
      }
    });

export const test = browserTests.extend<{ pageFaults: Error[] }>({
  pageFaults: async ({ page }, use) => {
    const faults: Error[] = [];
    page.on('pageerror', error => faults.push(error));
    await use(faults);
    expect(faults.map(error => error.message)).toEqual([]);
  }
});

export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
}

export async function makeProject(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByPlaceholder('Project title').fill(title);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
}

export async function loadDemo(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole('button', { name: 'Load demo projects' }).click();
  await expect(page.getByRole('button', { name: 'Resume screenplay' })).toBeVisible();
}

export { expect };

/** The manuscript is one ProseMirror document; each screenplay element is a paragraph. */
export function manuscript(page: Page) {
  return page.getByRole('textbox', { name: /manuscript$/ });
}

export function element(page: Page, kind: string) {
  return page.locator(`.swdr-pm .swdr-el[data-element="${kind}"]`);
}

export async function elementKinds(page: Page): Promise<string[]> {
  return page.locator('.swdr-pm .swdr-el').evaluateAll(nodes => nodes.map(node => `${(node as HTMLElement).dataset.element}:${(node as HTMLElement).innerText.replace(/\n.*$/s, '')}`));
}

/** Caret inside a manuscript element, as offsets within that element's text. */
export async function caretIn(locator: import('@playwright/test').Locator) {
  return locator.evaluate(node => {
    const selection = getSelection();
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) return null;
    const offset = (target: Node | null, at: number) => {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(target ?? node, at);
      return range.toString().length;
    };
    const range = selection.getRangeAt(0);
    return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) };
  });
}

/**
 * Picks an option from an Astryx Selector the way a person does: open the combobox by its label, then click the
 * option by its visible name or position. (Astryx selectors are not native <select>s, so selectOption does not apply.)
 */
export async function choose(scope: Page | import('@playwright/test').Locator, label: string | RegExp, option: string | RegExp | { index: number }): Promise<void> {
  const page = 'context' in scope ? scope as Page : (scope as import('@playwright/test').Locator).page();
  await scope.getByRole('combobox', { name: label, exact: typeof label === 'string' }).click();
  const options = page.getByRole('option');
  await (typeof option === 'object' && 'index' in option
    ? options.nth(option.index)
    : page.getByRole('option', { name: option, exact: typeof option === 'string' })).click();
}

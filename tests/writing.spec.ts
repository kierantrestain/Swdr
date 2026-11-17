import type { Locator } from '@playwright/test';
import { expect, loadDemo, makeProject, openHome, test } from './support/browser';

async function caret(field: Locator) {
  return field.evaluate((element: HTMLTextAreaElement) => ({
    selected: element === document.activeElement,
    start: element.selectionStart,
    end: element.selectionEnd
  }));
}

test('creates, formats, saves and reopens a screenplay with the keyboard', async ({ page, pageFaults }) => {
  await openHome(page);
  await makeProject(page, 'The Lantern Room');
  const scene = page.getByRole('textbox', { name: 'Scene heading', exact: true });
  await scene.fill('int. lantern room - night');
  await expect(scene).toHaveValue('INT. LANTERN ROOM - NIGHT');
  await scene.press('End');
  await scene.press('Enter');
  const action = page.getByRole('textbox', { name: 'Action', exact: true });
  await expect(action).toBeFocused();
  await action.press('Tab');
  const character = page.getByRole('textbox', { name: 'Character', exact: true });
  await expect(character).toBeFocused();
  await character.press('Shift+Tab');
  await expect(action).toBeFocused();
  await action.press('Tab');
  await character.fill('Mara');
  await expect(character).toHaveValue('MARA');
  await character.press('End');
  await character.press('Enter');
  const dialogue = page.getByRole('textbox', { name: 'Dialogue', exact: true });
  await expect(dialogue).toBeFocused();
  await dialogue.fill('The train leaves at midnight.');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume screenplay', exact: true }).click();
  await expect(scene).toHaveValue('INT. LANTERN ROOM - NIGHT');
  await expect(character).toHaveValue('MARA');
  await expect(dialogue).toHaveValue('The train leaves at midnight.');
  expect(pageFaults).toEqual([]);
});

test('recovers a pending offline edit after an interrupted write and page restart', async ({ page, context }) => {
  await openHome(page);
  await makeProject(page, 'The Breakwater Log');
  const scene = page.getByRole('textbox', { name: 'Scene heading', exact: true });
  await scene.fill('EXT. BREAKWATER - DAY');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = put.call(this, value, key);
      if (this.name === 'projects' || this.name === 'documents') this.transaction.abort();
      return request;
    };
  });
  await scene.fill('EXT. BREAKWATER - DAWN');
  await expect(page.getByText('Local save needs attention', { exact: true })).toBeVisible();
  const pending = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('swdr:journal:')).length);
  expect(pending).toBeGreaterThan(0);

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Scene heading', exact: true })).toHaveValue('EXT. BREAKWATER - DAWN');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('swdr:journal:')).length)).toBe(0);
});

test('keeps caret and scroll through Focus and drawer toggles', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  const dialogue = page.getByRole('textbox', { name: 'Dialogue', exact: true }).first();
  const scroller = page.getByLabel('Manuscript pages');
  await dialogue.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(3, 8);
    element.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await expect.poll(() => caret(dialogue)).toEqual({ selected: true, start: 3, end: 8 });
  const before = await scroller.evaluate(element => {
    element.scrollTop = 95;
    return element.scrollTop;
  });
  const shell = page.getByRole('region', { name: 'Manuscript editor' });
  await dialogue.press('Control+Shift+f');
  await expect(shell).toHaveClass(/swdr-writing-focus/);
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0);
  await expect.poll(() => caret(dialogue)).toEqual({ selected: true, start: 3, end: 8 });
  await dialogue.press('Escape');
  await expect(shell).not.toHaveClass(/swdr-writing-focus/);
  await expect.poll(() => caret(dialogue)).toEqual({ selected: true, start: 3, end: 8 });
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBe(before);
  const scenes = page.getByRole('button', { name: 'Scenes', exact: true });
  await expect(scenes).toHaveAttribute('aria-expanded', 'false');
  await scenes.click();
  await expect(page.getByRole('complementary', { name: 'Scenes', exact: true })).toBeVisible();
  await expect.poll(() => caret(dialogue)).toEqual({ selected: true, start: 3, end: 8 });
  await page.getByRole('complementary', { name: 'Scenes', exact: true })
    .getByRole('button', { name: /HARBOUR WALL/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Scene 3' })).toHaveCount(1);
  await expect.poll(() => caret(dialogue)).toEqual({ selected: true, start: 3, end: 8 });
  await dialogue.press('Escape');
  await expect(scenes).toHaveAttribute('aria-expanded', 'false');
  expect(pageFaults).toEqual([]);
});

test('captures the writing workspace on desktop, tablet and phone', async ({ page }, testInfo) => {
  await loadDemo(page);
  await page.screenshot({ path: testInfo.outputPath('01-home-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene heading', exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-write-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Esc to exit focus' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('03-focus-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Esc to exit focus' }).click();

  for (const [width, height] of [[768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath(`02-write-${width}x${height}.png`), animations: 'disabled' });
  }
});

test('creates a scene from an outline beat and opens the exact linked heading', async ({ page }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Episode outline', exact: true })).toBeVisible();
  await expect(page.getByText('The paper ticket', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('06-outline-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Add beat', exact: true }).first().click();
  await page.getByRole('textbox', { name: /^Beat title/ }).fill('The last stamp');
  await page.getByRole('textbox', { name: /^Notes/ }).fill('Nora stamps the final ticket.');
  await page.getByRole('button', { name: 'Create scene', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const beat = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'The last stamp', exact: true }) });
  await beat.getByRole('button', { name: 'Scene 4', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
  const heading = page.getByRole('textbox', { name: 'Scene heading', exact: true }).last();
  await expect(heading).toHaveValue('INT. LOCATION – DAY');
  await expect(heading).toBeFocused();
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
});

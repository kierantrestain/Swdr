import { caretIn, element, elementKinds, expect, loadDemo, makeProject, manuscript, openHome, test } from './support/browser';

test('creates, formats, saves and reopens a screenplay with the keyboard', async ({ page, pageFaults }) => {
  await openHome(page);
  await makeProject(page, 'The Lantern Room');
  await element(page, 'scene').first().click();
  await page.keyboard.type('int. lantern room - night');
  await expect(element(page, 'scene').first()).toHaveText('INT. LANTERN ROOM - NIGHT', { useInnerText: true });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Rain on the lamp glass.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Screenplay element/ })).toHaveAttribute('data-element', 'character');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: /^Screenplay element/ })).toHaveAttribute('data-element', 'action');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Mara');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Screenplay element/ })).toHaveAttribute('data-element', 'dialogue');
  await page.keyboard.type('The train leaves at midnight.');
  expect(await elementKinds(page)).toEqual([
    'scene:INT. LANTERN ROOM - NIGHT', 'action:Rain on the lamp glass.', 'character:MARA', 'dialogue:The train leaves at midnight.'
  ]);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume screenplay', exact: true }).click();
  await expect(element(page, 'dialogue')).toHaveText('The train leaves at midnight.');
  expect(await elementKinds(page)).toEqual([
    'scene:INT. LANTERN ROOM - NIGHT', 'action:Rain on the lamp glass.', 'character:MARA', 'dialogue:The train leaves at midnight.'
  ]);
  expect(pageFaults).toEqual([]);
});

test('writes a scene with SmartType, auto-format, multi-block paste and undo', async ({ page, pageFaults }) => {
  await openHome(page);
  await makeProject(page, 'The Signal Box');
  await element(page, 'scene').first().click();
  await page.keyboard.type('i');
  const suggestions = page.getByRole('listbox', { name: 'Suggestions' });
  await expect(suggestions.getByRole('option')).toHaveText(['INT.', 'INT./EXT.', 'I/E.']);
  await page.keyboard.press('Enter');
  await page.keyboard.type('SIGNAL BOX - NIGHT');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Levers in a row. One is chalked red.');
  await page.keyboard.press('Tab');
  await page.keyboard.type('ADA');
  await page.keyboard.press('Enter');
  await page.keyboard.type('(');
  await page.keyboard.type('quietly');
  await page.keyboard.type(')');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Pull the red one.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Screenplay element/ })).toHaveAttribute('data-element', 'scene');
  await page.keyboard.type('e');
  await page.keyboard.press('Enter');
  await expect(suggestions.getByRole('option')).toHaveText(['SIGNAL BOX']);
  await page.keyboard.press('Enter');
  await page.keyboard.type('dawn');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ada walks the line. ');
  await page.keyboard.press('Tab');
  await page.keyboard.type('a');
  await expect(suggestions.getByRole('option')).toHaveText(['ADA']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Shift+Tab');
  const expected = [
    'scene:INT. SIGNAL BOX - NIGHT', 'action:Levers in a row. One is chalked red.', 'character:ADA',
    'parenthetical:(quietly)', 'dialogue:Pull the red one.', 'scene:EXT. SIGNAL BOX - DAWN', 'action:Ada walks the line.', 'action:'
  ];
  expect((await elementKinds(page)).map(item => item.trimEnd())).toEqual(expected);

  // Select the whole first scene across five elements, copy, and paste it at the end.
  const blocks = page.locator('.swdr-pm .swdr-el');
  await blocks.nth(0).click({ position: { x: 2, y: 4 } });
  await page.keyboard.press('Home');
  for (let index = 0; index < 4; index++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+c');
  await blocks.last().click();
  await page.keyboard.press('Control+v');
  await expect(blocks).toHaveCount(12);
  const pasted = (await elementKinds(page)).slice(7).map(item => item.split(':')[0]);
  expect(pasted).toEqual(['scene', 'action', 'character', 'parenthetical', 'dialogue']);
  const ids = await blocks.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.blockId));
  expect(new Set(ids).size).toBe(ids.length);

  await page.keyboard.press('Control+z');
  await expect(blocks).toHaveCount(8);
  await page.keyboard.press('Control+Shift+z');
  await expect(blocks).toHaveCount(12);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('recovers a pending offline edit after an interrupted write and page restart', async ({ page, context }) => {
  await openHome(page);
  await makeProject(page, 'The Breakwater Log');
  const scene = element(page, 'scene').first();
  await scene.click();
  await page.keyboard.type('EXT. BREAKWATER - DAY');
  await page.keyboard.press('Escape');
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
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('DAWN');
  await expect(page.getByText('Local save needs attention', { exact: true })).toBeVisible();
  const pending = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('swdr:journal:')).length);
  expect(pending).toBeGreaterThan(0);

  await context.setOffline(false);
  await page.reload();
  await expect(element(page, 'scene').first()).toHaveText('EXT. BREAKWATER - DAWN');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('swdr:journal:')).length)).toBe(0);
});

test('keeps the selection through Focus and drawers, and the scene list moves the caret', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  const dialogue = element(page, 'dialogue').first();
  await dialogue.evaluate(node => {
    const text = node.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 8);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await expect.poll(() => caretIn(dialogue)).toEqual({ start: 3, end: 8 });
  const shell = page.getByRole('region', { name: 'Manuscript editor' });
  await page.keyboard.press('Control+Shift+f');
  await expect(shell).toHaveClass(/swdr-writing-focus/);
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0);
  await expect.poll(() => caretIn(dialogue)).toEqual({ start: 3, end: 8 });
  await page.keyboard.press('Escape');
  await expect(shell).not.toHaveClass(/swdr-writing-focus/);
  await expect.poll(() => caretIn(dialogue)).toEqual({ start: 3, end: 8 });

  const scenes = page.getByRole('button', { name: 'Scenes', exact: true });
  const list = page.getByRole('complementary', { name: 'Scenes', exact: true });
  await expect(list).toHaveCount(0);
  await scenes.click();
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: /HARBOUR WALL/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Scene 3' })).toHaveCount(1);
  await expect.poll(() => caretIn(element(page, 'scene').nth(2))).toEqual({ start: 0, end: 0 });
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  expect(pageFaults).toEqual([]);
});

test('shows every element shortcut in the element menu and applies the choice', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await element(page, 'dialogue').first().click();
  const trigger = page.getByRole('button', { name: /^Screenplay element/ });
  await expect(trigger).toHaveAttribute('data-element', 'dialogue');
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByText('Tab to switch')).toBeVisible();
  for (const label of ['Scene heading', 'Action', 'Character', 'Parenthetical', 'Dialogue', 'Transition', 'Shot', 'Note', 'Act']) {
    await expect(menu.getByRole('menuitem', { name: new RegExp(`^${label}\\b(?!ion)`) })).toBeVisible();
  }
  await expect(menu.getByRole('menuitem', { name: /^Transition/ })).toContainText('6');
  await menu.getByRole('menuitem', { name: /^Parenthetical/ }).click();
  await expect(trigger).toHaveAttribute('data-element', 'parenthetical');
  await expect(manuscript(page)).toBeFocused();
  await page.keyboard.press('Control+Alt+5');
  await expect(trigger).toHaveAttribute('data-element', 'dialogue');
  await page.getByRole('button', { name: '100%' }).click();
  await page.getByRole('menuitem', { name: '125%' }).click();
  await expect(page.locator('.swdr-sheet')).toHaveCSS('zoom', '1.25');
  await expect(page.locator('.swdr-w-words')).toHaveText(/^\d[\d,]* words$/);
  expect(pageFaults).toEqual([]);
});

test('shows the title page as the first sheet and opens its details', async ({ page, pageFaults }) => {
  await openHome(page);
  await makeProject(page, 'Blind Spot');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.locator('.swdr-w-drawer summary', { hasText: 'Page and title' }).click();
  await page.getByRole('checkbox', { name: 'Include title page' }).check();
  await page.getByRole('textbox', { name: 'Author' }).fill('Kieran Trestain');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  const sheet = page.getByRole('button', { name: /^Title page/ });
  await expect(sheet.locator('.swdr-title-line')).toHaveText(['BLIND SPOT', 'Written by', 'Kieran Trestain']);
  await sheet.click();
  await expect(page.getByRole('textbox', { name: 'Author' })).toHaveValue('Kieran Trestain');
  expect(pageFaults).toEqual([]);
});

test('anchors a comment to a passage, keeps it through edits and reloads, then resolves it', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  const dialogue = element(page, 'dialogue').first();
  await expect(dialogue).toHaveText('Tell me which boat.');
  await dialogue.click();
  await dialogue.evaluate(node => {
    const text = node.firstChild!;
    const range = node.ownerDocument.createRange();
    range.setStart(text, 8);
    range.setEnd(text, 18);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  const add = page.getByRole('button', { name: 'Add comment' });
  await expect(add).not.toHaveAttribute('aria-disabled', 'true');
  await add.click();
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await expect(panel.getByRole('button', { name: 'Show passage: which boat' })).toBeVisible();
  await panel.getByRole('textbox', { name: 'Comment' }).fill('Make the boat a name she knows.');
  await expect(page.locator('.swdr-comment')).toHaveText('which boat');

  // Typing before the passage moves the anchor with the words.
  await dialogue.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Just ');
  await expect(page.locator('.swdr-comment')).toHaveText('which boat');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.swdr-comment')).toHaveText('which boat');
  await page.getByRole('button', { name: 'Comments 1' }).click();
  await expect(panel.getByRole('textbox', { name: 'Comment' })).toHaveValue('Make the boat a name she knows.');
  await panel.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.locator('.swdr-comment')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: /Show resolved/ }).check();
  await panel.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.locator('.swdr-comment')).toHaveText('which boat');
  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.swdr-comment')).toHaveCount(0);
  expect(pageFaults).toEqual([]);
});

test('applies bold, italic and underline with shortcuts and toolbar, and keeps them after reload', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  const action = element(page, 'action').first();
  const select = async (from: number, to: number) => {
    await action.click();
    await action.evaluate((node, [start, end]) => {
      const text = node.firstChild!;
      const range = node.ownerDocument.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    }, [from, to]);
  };
  await select(2, 11);
  await page.keyboard.press('Control+b');
  await expect(action.locator('strong')).toHaveText('desk lamp');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await select(0, 1);
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(action.locator('em')).toHaveText('A');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(element(page, 'action').first().locator('strong')).toHaveText('desk lamp');
  await expect(element(page, 'action').first().locator('em')).toHaveText('A');
  expect(pageFaults).toEqual([]);
});

test('cycles alternate dialogue in place without losing any wording', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  const line = element(page, 'dialogue').first();
  await expect(line).toHaveText('Tell me which boat.');
  await line.click();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.locator('.swdr-w-drawer summary', { hasText: 'Active element' }).click();
  await page.getByPlaceholder('One alternative per line').fill('Which boat was it?\nSay the name of the boat.');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(line).toHaveAttribute('data-alternates', '2');
  await line.click();
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(line).toHaveText('Which boat was it?');
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(line).toHaveText('Say the name of the boat.');
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(line).toHaveText('Tell me which boat.');
  await page.keyboard.press('Control+Alt+ArrowUp');
  await expect(line).toHaveText('Say the name of the boat.');
  await expect(line).toHaveAttribute('data-alternates', '2');
  expect(pageFaults).toEqual([]);
});

test('finds and replaces across the manuscript', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await element(page, 'action').first().click();
  await page.keyboard.press('Control+f');
  const find = page.getByRole('textbox', { name: 'Find', exact: true });
  await expect(find).toBeFocused();
  await find.fill('ticket');
  await expect(page.locator('.swdr-finder-count')).toHaveText(/^1 of [3-9]$/);
  const count = Number((await page.locator('.swdr-finder-count').textContent())!.split(' of ')[1]);
  await expect(page.locator('.swdr-find')).toHaveCount(count);
  await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('voucher');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.swdr-finder-count')).toHaveText('No matches');
  await expect(page.locator('.swdr-pm')).toContainText('voucher');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('search')).toHaveCount(0);
  expect(pageFaults).toEqual([]);
});

test('captures the writing workspace on desktop, tablet and phone', async ({ page }, testInfo) => {
  await loadDemo(page);
  await page.screenshot({ path: testInfo.outputPath('01-home-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Resume screenplay' }).click();
  await expect(element(page, 'scene').first()).toBeVisible();
  await expect(manuscript(page)).toBeVisible();
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
  const heading = element(page, 'scene').last();
  await expect(heading).toHaveText('INT. LOCATION – DAY');
  await expect.poll(() => caretIn(heading)).toEqual({ start: 0, end: 0 });
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
});

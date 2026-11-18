import type { Page } from '@playwright/test';
import { element, expect, loadDemo, test } from './support/browser';

const sections = (page: Page) => page.getByRole('navigation', { name: 'Project sections' });
const trail = (page: Page) => page.getByRole('navigation', { name: 'You are here' });
const currentEpisode = (page: Page) => trail(page).getByRole('button', { name: /^S\dE\d\d · / });

async function openNorthShore(page: Page) {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await expect(page.getByRole('heading', { name: 'The North Shore', level: 1 })).toBeVisible();
}

test('every page has a trail and a working Back, Home and project link', async ({ page, pageFaults }) => {
  await openNorthShore(page);
  await expect(trail(page).getByRole('link', { name: 'Projects', exact: true })).toBeVisible();

  const pages: [string, RegExp | string][] = [
    ['Script', ''], ['Outline', 'Episode outline'], ['Series Intelligence', 'Series Intelligence'], ['Schedule', 'Shooting stripboard'],
    ['Breakdown', 'Script breakdown'], ['Shots & storyboard', 'Shots and storyboard'], ['Sides', 'Shooting sides'],
    ['Call sheets', 'Call sheets'], ['Reports', 'Production reports'], ['Budget', 'Production reports'], ['Import & files', 'Import script']
  ];
  for (const [link, heading] of pages) {
    await sections(page).getByRole('link', { name: link, exact: true }).click();
    if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    else await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
    await expect(sections(page).getByRole('link', { name: link, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(trail(page).getByRole('button', { name: 'The North Shore', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The North Shore', level: 1 })).toBeVisible();
    await page.goForward();
    await trail(page).getByRole('button', { name: 'The North Shore', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The North Shore', level: 1 })).toBeVisible();
  }

  // A page opened directly (a shared link in a new tab) has no history to return to: Back goes to its parent.
  const shared = await page.context().newPage();
  await shared.goto(page.url().replace('/project/', '/production/') + '?tab=sides');
  await expect(shared.getByRole('heading', { name: 'Shooting sides', level: 1 })).toBeVisible();
  await shared.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(shared.getByRole('heading', { name: 'The North Shore', level: 1 })).toBeVisible();
  // From there Back is ordinary history again, and Home always leads to the library.
  await shared.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(shared.getByRole('heading', { name: 'Shooting sides', level: 1 })).toBeVisible();
  await shared.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(shared.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await shared.close();

  await page.goto('/#import');
  await expect(page.getByRole('heading', { name: 'Import script', level: 1 })).toBeVisible();
  await trail(page).getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();

  for (const hash of ['#team', '#review=missing-key']) {
    await page.goto('/' + hash);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  }
  expect(pageFaults).toEqual([]);
});

test('switching episode keeps the section and updates Write, Outline, Production and Series Intelligence', async ({ page, pageFaults }) => {
  await openNorthShore(page);
  await sections(page).getByRole('link', { name: 'Script', exact: true }).click();
  await expect(element(page, 'scene').first()).toHaveText('INT. FERRY OFFICE – NIGHT');
  await expect(currentEpisode(page)).toHaveText(/S1E04 · Doubt/);

  await page.getByRole('button', { name: 'Next episode', exact: true }).click();
  await expect(currentEpisode(page)).toHaveText(/S1E05 · The Service Road/);
  await expect(element(page, 'scene').first()).toHaveText('EXT. HARBOUR – DAWN');
  await expect(element(page, 'action').first()).toContainText('the service road');
  expect(page.url()).toContain('/write/');

  await sections(page).getByRole('link', { name: 'Outline', exact: true }).click();
  await expect(page.getByText('Season 1 · Episode 5 · The Service Road', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous episode', exact: true }).click();
  await expect(page.getByText('Season 1 · Episode 4 · Doubt', { exact: true })).toBeVisible();
  await expect(page.getByText('The original timetable', { exact: true })).toBeVisible();
  // Choosing an episode inside the outline moves the whole shell with it.
  await page.getByLabel('Episode', { exact: true }).selectOption({ label: '7. Dead Water' });
  await expect(currentEpisode(page)).toHaveText(/S1E07 · Dead Water/);

  await sections(page).getByRole('link', { name: 'Breakdown', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Release a script for production' })).toBeVisible();
  await expect(page.getByRole('main').getByText('S1E07 · Dead Water', { exact: true }).filter({ visible: true })).toBeVisible();
  await currentEpisode(page).click();
  await page.getByRole('menuitem', { name: /S1E04 · Doubt/ }).click();
  await expect(page.getByRole('heading', { name: 'Script breakdown', level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByText('S1E04 · Doubt', { exact: true }).filter({ visible: true })).toBeVisible();
  expect(page.url()).toContain('tab=breakdown');

  await sections(page).getByRole('link', { name: 'Series Intelligence', exact: true }).click();
  await expect(page.getByLabel('As of episode').locator('option:checked')).toHaveText('As of S1E04');
  await page.keyboard.press(']');
  await expect(currentEpisode(page)).toHaveText(/S1E05/);
  await expect(page.getByLabel('As of episode').locator('option:checked')).toHaveText('As of S1E05');
  expect(pageFaults).toEqual([]);
});

test('switching episode in a factual series updates the editorial outline', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
  await sections(page).getByRole('link', { name: 'Editorial', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Price of Progress', level: 1 })).toBeVisible();
  await expect(page.getByText(/75-minute outline/)).toBeVisible();
  await page.getByRole('navigation', { name: 'Editorial workspaces' }).getByRole('button', { name: 'Claims', exact: true }).click();

  await page.getByRole('button', { name: 'Next episode', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Case 2', level: 1 })).toBeVisible();
  await expect(currentEpisode(page)).toHaveText(/S1E02 · Case 2/);
  await expect(page.getByRole('heading', { name: 'Claim verification' })).toBeVisible();

  // The page's own document picker moves the shell too.
  await page.getByLabel('Editorial document').selectOption({ label: 'Case 3' });
  await expect(currentEpisode(page)).toHaveText(/S1E03 · Case 3/);
  // Picking a document replaces the entry, so Back returns to the episode before the switch.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Price of Progress', level: 1 })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('the command palette jumps to sections, episodes and scenes', async ({ page, pageFaults }) => {
  await openNorthShore(page);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('Call sheets');
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Call sheets', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.keyboard.type('S1E09');
  await page.keyboard.press('Enter');
  await expect(currentEpisode(page)).toHaveText(/S1E09 · Rising Tide/);
  await expect(page.getByRole('heading', { name: 'Release a script for production' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await page.keyboard.type('S1E04');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('HARBOUR WALL');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
  expect(page.url()).toMatch(/\/write\/.*scene=/);
  expect(pageFaults).toEqual([]);
});

test('keyboard shortcuts open the help dialog and navigate with g then a letter', async ({ page, pageFaults }) => {
  await openNorthShore(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Command palette: jump to a section, episode or scene')).toBeVisible();
  for (const name of ['Scene heading', 'Action', 'Character', 'Parenthetical', 'Dialogue', 'Transition', 'Shot', 'Note', 'Act']) {
    await expect(help.getByRole('row', { name: new RegExp(`^${name}\\b`) }).first()).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('g');
  await page.keyboard.press('o');
  await expect(page.getByRole('heading', { name: 'Episode outline', level: 1 })).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Shooting stripboard', level: 1 })).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('the sidebar collapses inside Write and the shell has no horizontal scroll at any width', async ({ page }) => {
  await openNorthShore(page);
  await expect(sections(page).getByRole('link', { name: 'Schedule', exact: true })).toBeVisible();
  const sidebarWidth = () => sections(page).evaluate(node => node.getBoundingClientRect().width);
  const pageWidth = await sidebarWidth();
  await sections(page).getByRole('link', { name: 'Script', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
  await expect.poll(sidebarWidth).toBeLessThan(pageWidth / 2);
  await page.keyboard.press('Control+\\');
  await expect.poll(sidebarWidth).toBeGreaterThan(pageWidth / 2);

  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const view of ['project', 'production', 'story']) {
      await page.goto(page.url().replace(/\/(write|project|production|story)\//, `/${view}/`));
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${view} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});

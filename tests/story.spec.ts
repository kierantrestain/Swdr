import { readFile } from 'node:fs/promises';
import { choose, expect, loadDemo, openHome, test } from './support/browser';
import { expectPassage } from './story-passage';

test('filters a 24-episode series, exports spoiler-safe data and traces a dossier interaction to its line', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await expect(page.locator('.document-row')).toHaveCount(24);
  await page.getByRole('button', { name: /^Series Intelligence/ }).click();
  await expect(page.getByRole('heading', { name: 'Series Intelligence', exact: true })).toBeVisible();
  await expect(page.getByText('Approved canon · The North Shore', { exact: true })).toBeVisible();

  await choose(page, 'As of episode', 'As of S1E04');
  await expect(page.getByRole('button', { name: 'Open character dossier' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('07-series-intelligence-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Open character dossier' }).click();
  await expect(page.getByRole('heading', { name: 'Nora Vale', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Key interactions', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Character arc progression/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('08-character-dossier-1440x900.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Relationship web', exact: true }).click();

  await choose(page, 'As of episode', 'As of S1E03');
  const exportEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export visible story', exact: true }).click();
  const exported = await (await exportEvent).path();
  if (!exported) throw new Error('Story export has no local file.');
  const spoilerSafe = await readFile(exported, 'utf8');
  expect(spoilerSafe).toContain('Jonah');
  expect(spoilerSafe).not.toContain('Elias');
  expect(spoilerSafe).not.toContain('The last departure');

  await choose(page, 'As of episode', 'As of S1E04');
  await page.getByRole('button', { name: 'Open character dossier' }).click();
  const interaction = page.locator('li').filter({ hasText: 'Elias changes the date on the timetable' });
  const specificSource = page.getByRole('button', { name: /S1E04 · Scene 1 · Line 9/ });
  await expect(interaction.first()).toBeVisible();
  await specificSource.first().click();
  await expectPassage(page, 'The timetable they sent you is for tomorrow.', { readOnly: true });
  expect(page.url()).toMatch(/rev=.*scene=.*block=/);
  expect(pageFaults).toEqual([]);
});

test('connects portraits, series timeline filters, script drawer, command palette and script scan across the workspace', async ({ page, pageFaults }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The North Shore' }).click();
  await expect(page.getByRole('region', { name: 'Project pulse' })).toContainText('7 cast');

  // Script editor Story bible drawer opens directly into a Character Dossier.
  await page.getByRole('navigation', { name: 'Project sections' }).getByRole('link', { name: 'Script', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Story bible', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: 'Series Intelligence' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Spoiler-safe as of S1E04');
  await drawer.getByText('Elias Crowe', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elias Crowe', level: 1 })).toBeVisible();
  expect(page.url()).toContain('character=');

  // Back to Relationship web: portraits load cleanly and Major Events timeline filters by character.
  await page.getByRole('button', { name: 'Relationship web', exact: true }).click();
  await choose(page, 'Season', 'All seasons');
  const loadedPortraits = await page.locator('img[src^="/portraits/"]').evaluateAll(imgs =>
    imgs.map(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)
  );
  expect(loadedPortraits.length).toBeGreaterThan(0);
  expect(loadedPortraits.every(Boolean)).toBe(true);

  const timeline = page.getByRole('region', { name: 'Major events timeline' });
  await timeline.getByRole('button', { name: 'Jonah', exact: true }).click();
  await expect(timeline).toContainText('Jonah produces the original');

  // Working draft exposes Script scan dialog.
  await choose(page, 'Canon or draft', 'Working draft');
  await page.getByRole('button', { name: 'Scan scripts', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Scan scripts for characters & appearances' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Command palette jumps directly to a character dossier.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Mara Quinn');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mara Quinn', level: 1 })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('corrects a claim in a 75-minute outline and downloads four files from the same reissued revision', async ({ page, pageFaults }, testInfo) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Open project The Evidence Room' }).click();
  await expect(page.locator('.document-row')).toHaveCount(24);
  await page.getByRole('button', { name: 'Open The Price of Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Price of Progress', exact: true })).toBeVisible();
  await expect(page.getByText(/75-minute outline/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('09-editorial-1440x900.png'), animations: 'disabled' });

  const tabs = page.locator('[aria-label="Editorial workspaces"]');
  await tabs.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('article').filter({ hasText: 'three costed alternatives' })
    .getByRole('button', { name: 'Correct claim', exact: true }).click();
  await page.getByRole('textbox', { name: /^Exact claim/ }).fill('The committee compared two costed alternatives before the vote.');
  await page.getByLabel('Reason for correction').fill('One option had no cost schedule.');
  await page.getByRole('button', { name: 'Save claim', exact: true }).click();
  await tabs.getByRole('button', { name: /^Issues/ }).click();
  await expect(page.getByText('Reissue after source corrections', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Issue outputs', exact: true }).click();
  await expect(page.getByText('Reissue after source corrections', { exact: true })).toHaveCount(0);

  const revisions = new Set<string>();
  const titles = ['Research dossier', 'Host guide', 'Producer rundown', 'Graphics and asset register'];
  for (const title of titles) {
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const downloadStarted = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toContain('issue-2');
    const path = await download.path();
    if (!path) throw new Error('Issued output has no local file.');
    const content = await readFile(path, 'utf8');
    expect(content).toContain(`# ${title}`);
    const revision = /Editorial revision (\S+)/.exec(content)?.[1];
    expect(revision).toBeTruthy();
    revisions.add(revision!);
    if (title === 'Research dossier') expect(content).toContain('two costed alternatives');
  }
  expect(revisions.size).toBe(1);
  expect(pageFaults).toEqual([]);
});

test('Film Intelligence maps a multi-act feature via one-click script scan, act filters and cursor-aware Story bible drawer', async ({ page, pageFaults }) => {
  await openHome(page);
  await page.evaluate(async () => {
    const blocks: Array<{ id: string; kind: string; text: string; sceneId?: string }> = [];
    for (let i = 1; i <= 30; i += 1) {
      blocks.push({ id: `sc-${i}`, kind: 'scene', text: i % 2 === 1 ? `INT. LAB ${i} - DAY` : `EXT. HARBOUR ${i} - NIGHT`, sceneId: `scene-${i}` });
      blocks.push({ id: `ac-${i}`, kind: 'action', text: `Sequence ${i} begins.` });
      blocks.push({ id: `ch-aris-${i}`, kind: 'character', text: 'DR. ARIS' });
      blocks.push({ id: `dl-aris-${i}`, kind: 'dialogue', text: `Run ${i} confirms the forecast.` });
      if (i <= 20 || i >= 26) {
        blocks.push({ id: `ch-maya-${i}`, kind: 'character', text: 'MAYA' });
        blocks.push({ id: `dl-maya-${i}`, kind: 'dialogue', text: `Shut it down before run ${i}.` });
      }
      if (i >= 25) {
        blocks.push({ id: `ch-vance-${i}`, kind: 'character', text: 'DIRECTOR VANCE' });
        blocks.push({ id: `dl-vance-${i}`, kind: 'dialogue', text: `Phase ${i} stays online.` });
      }
    }
    const now = new Date().toISOString();
    const project = {
      id: 'film-pred-1',
      title: 'The Prediction Engine',
      kind: 'film',
      synopsis: 'A systems theorist races to shut down her own forecasting engine.',
      createdAt: now,
      updatedAt: now,
      episodes: [],
      documents: [{
        id: 'doc-pred-1',
        title: 'The Prediction Engine',
        kind: 'screenplay',
        paper: 'letter',
        revisionId: 'rev-pred-1',
        revisionLabel: 'First draft',
        titlePage: { title: 'The Prediction Engine', author: 'Kieran', draftDate: '', contact: '', copyright: '', notes: '' },
        blocks,
        avRows: [],
        beats: [],
        notes: ''
      }],
      snapshots: [],
      assets: [],
      modules: {}
    };
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('swdr-workspace', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects', { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains('cache')) req.result.createObjectStore('cache');
      };
      req.onsuccess = () => {
        const tx = req.result.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({ id: project.id, stamp: 'seed-1', project });
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  await page.reload();
  await page.getByRole('button', { name: 'Open project The Prediction Engine' }).click();
  await expect(page.getByRole('button', { name: /^Film Intelligence/ })).toContainText('Scan 30 scenes to map 3 speaking roles');
  await page.getByRole('navigation', { name: 'Project sections' }).getByRole('link', { name: 'Film Intelligence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Film Intelligence', level: 1 })).toBeVisible();
  await expect(page.getByText(/Found 3 speaking characters across 30 scenes/)).toBeVisible();

  await page.getByRole('button', { name: 'Scan script & build draft', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Scan scripts for characters & appearances' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Dr. Aris · Lead');
  await dialog.getByRole('button', { name: /Import .* to draft/ }).click();

  // Relationship web now holds imported characters and shared-scene links.
  await expect(page.getByRole('complementary', { name: 'Selected character' })).toContainText('Dr. Aris');

  // Story map shows 3-Act headers with bucketed Sequence columns.
  await page.locator('[aria-label="Series workspaces"]').getByRole('button', { name: 'Story map', exact: true }).click();
  const map = page.getByRole('region', { name: 'Story map' });
  await expect(map.getByRole('columnheader', { name: 'Act I', exact: true })).toBeVisible();
  await expect(map.getByRole('columnheader', { name: 'Act II', exact: true })).toBeVisible();
  await expect(map.getByRole('columnheader', { name: 'Act III', exact: true })).toBeVisible();

  // Filtering to Act I hides Act III-only character Director Vance.
  await choose(page, 'Act', 'Act I');
  await expect(page.getByRole('button', { name: 'Open Dr. Aris dossier' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Director Vance dossier' })).toHaveCount(0);

  // Script editor Story bible drawer is scene-aware and spoiler-safe at Scene 1.
  await page.getByRole('navigation', { name: 'Project sections' }).getByRole('link', { name: 'Script', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Manuscript editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Story bible', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: 'Film Intelligence' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Spoiler-safe as of Act I · Sc 1');
  await expect(drawer).toContainText('Dr. Aris');
  await expect(drawer).not.toContainText('Director Vance');
  expect(pageFaults).toEqual([]);
});

test('Stage Intelligence honours explicit Act breaks, flags quick-change turnarounds and computes repertory doubling', async ({ page, pageFaults }) => {
  await openHome(page);
  await page.evaluate(async () => {
    const blocks = [
      { id: 'act-1', kind: 'act', text: 'ACT I' },
      { id: 'sc-1', kind: 'scene', text: 'INT. PARLOUR - EVENING', sceneId: 'scene-1' },
      { id: 'c1', kind: 'character', text: 'CLARA' },
      { id: 'd1', kind: 'dialogue', text: 'Light the lamps before the bell.' },
      { id: 'c2', kind: 'character', text: 'PORTER' },
      { id: 'd2', kind: 'dialogue', text: 'The coach is at the gate.' },
      { id: 'sc-2', kind: 'scene', text: 'EXT. COURTYARD - NIGHT', sceneId: 'scene-2' },
      { id: 'c3', kind: 'character', text: 'CLARA' },
      { id: 'd3', kind: 'dialogue', text: 'Wait in the rain — I heard footsteps.' },
      { id: 'inter', kind: 'act', text: 'INTERMISSION' },
      { id: 'act-2', kind: 'act', text: 'ACT II' },
      { id: 'sc-3', kind: 'scene', text: 'INT. CONSERVATORY - MORNING', sceneId: 'scene-3' },
      { id: 'c4', kind: 'character', text: 'CLARA' },
      { id: 'd4', kind: 'dialogue', text: 'The glass has cracked overnight.' },
      { id: 'c5', kind: 'character', text: 'JUDGE' },
      { id: 'd5', kind: 'dialogue', text: 'We begin the inquiry now.' }
    ];
    const now = new Date().toISOString();
    const project = {
      id: 'stage-parlour-1',
      title: 'The Glass Parlour',
      kind: 'stage',
      synopsis: 'A two-act chamber drama.',
      createdAt: now,
      updatedAt: now,
      episodes: [],
      documents: [{
        id: 'doc-parlour-1',
        title: 'The Glass Parlour',
        kind: 'stageplay',
        paper: 'a4',
        revisionId: 'rev-parlour-1',
        revisionLabel: 'Rehearsal draft',
        titlePage: { title: 'The Glass Parlour', author: 'Kieran', draftDate: '', contact: '', copyright: '', notes: '' },
        blocks,
        avRows: [],
        beats: [],
        notes: ''
      }],
      snapshots: [],
      assets: [],
      modules: {}
    };
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('swdr-workspace', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects', { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains('cache')) req.result.createObjectStore('cache');
      };
      req.onsuccess = () => {
        const tx = req.result.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({ id: project.id, stamp: 'seed-1', project });
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  await page.reload();
  await page.getByRole('button', { name: 'Open project The Glass Parlour' }).click();
  await page.getByRole('navigation', { name: 'Project sections' }).getByRole('link', { name: 'Stage Intelligence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stage Intelligence', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Scan script & build draft', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Scan scripts for characters & appearances' });
  await expect(dialog).toContainText('Clara · Principal');
  await dialog.getByRole('button', { name: /Import .* to draft/ }).click();

  await page.locator('[aria-label="Series workspaces"]').getByRole('button', { name: 'Story map', exact: true }).click();
  await expect(page.getByRole('button', { name: /^I\.1 / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^I\.2 / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^II\.1 / })).toBeVisible();

  await page.locator('[aria-label="Series workspaces"]').getByRole('button', { name: /^Arcs and continuity/ }).click();
  const doubling = page.getByRole('region', { name: 'Stage presence and doubling' });
  await expect(doubling).toBeVisible();
  await expect(doubling).toContainText('Porter');
  await expect(doubling).toContainText('Judge');
  await expect(page.getByText(/Quick-change alert: Clara/)).toBeVisible();

  // Overview pulse tile surfaces Stage canon + quick-change alert.
  await page.getByRole('navigation', { name: 'Project sections' }).getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Project pulse' })).toContainText('Stage canon');
  await expect(page.getByRole('region', { name: 'Project pulse' })).toContainText('1 quick-change');
  expect(pageFaults).toEqual([]);
});


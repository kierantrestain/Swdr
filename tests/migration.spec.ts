import { readFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import type { Page } from '@playwright/test';
import { createProject, issueDocument } from '../src/workspace/project';
import { newId, sceneList, sourceFor } from '../src/model';
import { exportArchive, importArchive } from '../src/interchange/archive';
import { exportDocx } from '../src/interchange/office';
import { exportFountain } from '../src/interchange/screenplay';
import { element, expect, manuscript, openHome, test } from './support/browser';
import { makeLongScript, onePixelPng, rasterPdf, sampleScreenplay } from './support/fixtures';

declare global {
  interface Window { swdrKeyFrameTimings?: number[] }
}

async function openImport(page: Page) {
  await openHome(page);
  await page.getByRole('button', { name: 'Import script', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose source files' })).toBeVisible();
  return page.getByLabel('Choose script files');
}

test('reviews a Word draft, corrects an element and begins the editable screenplay', async ({ page, pageFaults }, testInfo) => {
  const files = await openImport(page);
  await files.setInputFiles({
    name: 'Last Train.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(exportDocx(sampleScreenplay()))
  });
  await expect(page.getByRole('heading', { name: 'Review script import' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Original document' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('04-import-1440x900.png'), animations: 'disabled' });
  const source = page.getByRole('button', { name: 'Count the red lamps.', exact: true });
  if (!await source.isVisible()) {
    const pagePicker = page.getByLabel('Converted page');
    await pagePicker.selectOption({ index: (await pagePicker.getByRole('option').count()) - 1 });
  }
  await source.click();
  await page.getByLabel('Line text').fill('Count the lamps at the far end.');
  await page.getByRole('button', { name: 'Apply correction' }).click();
  await page.getByRole('button', { name: 'Import draft', exact: true }).click();
  await expect(element(page, 'dialogue').first()).toHaveText('Count the lamps at the far end.');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  expect(pageFaults).toEqual([]);
});

test('rejects an image-only scan and invalid source, then cancels and retries intake', async ({ page }) => {
  const files = await openImport(page);
  await files.setInputFiles([
    { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(rasterPdf(false)) },
    { name: 'unsupported.invalid', mimeType: 'application/octet-stream', buffer: Buffer.from('synthetic fixture') }
  ]);
  // The design system keeps a shared, empty assertive live region on the page; the intake alert is the one in the main content.
  await expect(page.getByRole('main').getByRole('alert')).toContainText('OCR');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('OCR');
  await page.getByRole('button', { name: 'Skip file', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Choose a supported file');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const retry = await openImport(page);
  await retry.setInputFiles({ name: 'Corrected.fountain', mimeType: 'text/plain', buffer: Buffer.from('EXT. STATION - DAY\n\nA bicycle leans on the rail.\n') });
  await page.getByRole('button', { name: 'Import draft', exact: true }).click();
  await expect(element(page, 'scene').first()).toHaveText('EXT. STATION - DAY');
});

test('restores a project archive, opens its exact issued line and re-exports the asset', async ({ page, pageFaults }) => {
  const project = createProject('The Issued Draft', 'film');
  const document = sampleScreenplay();
  project.documents = [document];
  const asset = {
    id: newId(), name: 'frame.png', mime: 'image/png', dataUrl: `data:image/png;base64,${onePixelPng}`,
    addedAt: '2026-11-17T17:00:00.000Z'
  };
  project.assets = [asset];
  const issued = issueDocument(project, document.id, 'Blue Issue');
  const scene = sceneList(document)[0];
  const source = sourceFor(issued.project, issued.snapshot.document, { sceneId: scene.id, blockId: document.blocks[4].id });
  issued.project.modules = { test: { source, assetId: asset.id } };

  const files = await openImport(page);
  await files.setInputFiles({
    name: 'The Issued Draft.swdr', mimeType: 'application/zip', buffer: Buffer.from(exportArchive(issued.project))
  });
  await expect(page.getByRole('heading', { name: 'Restore project archive' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore project', exact: true }).click();
  await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
  const hash = `#p/${project.id}/write/${document.id}?rev=${source.revisionId}&scene=${scene.id}&block=${source.blockId}`;
  await page.goto('/' + hash);
  const dialogue = element(page, 'dialogue').filter({ hasText: 'Count the red lamps.' });
  await expect(dialogue).toHaveText('Count the red lamps.');
  await expect(manuscript(page)).toHaveAttribute('contenteditable', 'false');

  // Export from the working copy while keeping the issued revision unchanged.
  await page.goto(`/#p/${project.id}/write/${document.id}`);
  await page.getByText('Export', { exact: true }).click();
  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Project archive/ }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/\.swdr$/);
  const local = await download.path();
  if (!local) throw new Error('Archive download has no local file.');
  const exported = importArchive(await readFile(local));
  expect(exported.assets[0].dataUrl).toEqual(asset.dataUrl);
  expect(exported.modules.test).toEqual(issued.project.modules.test);
  expect(pageFaults).toEqual([]);
});

test('measures keyboard input to a completed-frame proxy on a 150–200 page draft', async ({ page, pageFaults }, testInfo) => {
  const { document, pages } = makeLongScript();
  expect(pages).toBeGreaterThanOrEqual(150);
  expect(pages).toBeLessThanOrEqual(200);
  const files = await openImport(page);
  await files.setInputFiles({
    name: 'The Long Feature.fountain', mimeType: 'text/plain', buffer: Buffer.from(exportFountain(document))
  });
  await page.getByRole('button', { name: 'Import draft', exact: true }).click();
  const status = page.getByText(/^Page 1 of \d+$/);
  await expect(status).toBeVisible();
  const actualPages = Number((await status.textContent())?.split(' of ').at(-1));
  expect(actualPages).toBeGreaterThanOrEqual(150);
  expect(actualPages).toBeLessThanOrEqual(200);
  const action = element(page, 'action').first();
  await action.click();
  // End moves to the end of the visual line; place the caret at the end of the paragraph.
  await action.evaluate(node => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.waitForTimeout(50);
  // Sequential trusted keyboard events with two RAFs bound when the current input could be painted.
  await page.evaluate(() => {
    const timings: number[] = [];
    window.swdrKeyFrameTimings = timings;
    globalThis.document.addEventListener('input', event => {
      if (!event.isTrusted || !(event.target instanceof HTMLElement) || !event.target.closest('.swdr-pm')) return;
      const start = event.timeStamp;
      requestAnimationFrame(() => requestAnimationFrame(() => timings.push(performance.now() - start)));
    }, { capture: true });
  });
  const iterations = 64;
  for (let index = 0; index < iterations; index++) {
    await page.keyboard.press('x');
    await page.waitForFunction(n => (window.swdrKeyFrameTimings?.length ?? 0) >= n, index + 1);
  }
  expect(await action.textContent()).toMatch(/x{64}$/);
  const durations = await page.evaluate(() => window.swdrKeyFrameTimings ?? []);
  const sorted = durations.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * .95) - 1];
  const evidence = {
    metric: 'Trusted input event to the second animation frame callback',
    pages: actualPages, sampleCount: sorted.length, p95Ms: Number(p95.toFixed(2)),
    browser: page.context().browser()?.version(), os: platform() + ' ' + release(), architecture: arch(),
    viewport: page.viewportSize(), scope: 'Foreground local writing', targetMs: 50
  };
  await testInfo.attach('typing-performance', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify(evidence));
  expect(p95).toBeLessThan(50);
  expect(pageFaults).toEqual([]);
});

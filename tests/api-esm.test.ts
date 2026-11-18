import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Vercel compiles each function in api/ to native ESM ("type": "module") and keeps
// import specifiers as written. Node's ESM resolver needs explicit extensions, so an
// extensionless relative import compiles cleanly and then fails at cold start with
// ERR_MODULE_NOT_FOUND. This test reproduces that packaging and loads the handler.
test('team API loads as native ESM after per-file compilation', async () => {
  const root = resolve(import.meta.dirname, '..');
  const out = mkdtempSync(join(tmpdir(), 'swdr-api-esm-'));
  try {
    const tsc = spawnSync(process.execPath, [
      join(root, 'node_modules/typescript/bin/tsc'), 'api/team.ts', '--outDir', out, '--rootDir', '.',
      '--module', 'ESNext', '--moduleResolution', 'Bundler', '--target', 'ES2022', '--skipLibCheck', '--types', 'node'
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(tsc.status, 0, tsc.stdout + tsc.stderr);
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');
    symlinkSync(join(root, 'node_modules'), join(out, 'node_modules'));
    const handler = await import(pathToFileURL(join(out, 'api/team.js')).href);
    assert.equal(typeof handler.default, 'function');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

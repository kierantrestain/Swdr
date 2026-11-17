import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { Pool } from 'pg';
import handler from '../api/team';
import { newBlock, newDocument, sourceFor } from '../src/model';
import type { Project } from '../src/model';
import { createProject, issueDocument, resolveSource, restoreDocument } from '../src/workspace/project';
import type { TeamGrant } from '../src/workspace/team-contract';
import { applyProjection, mergeTeamProjects, preserveSnapshots, toVisibleProject, validateProject } from './team-model';
import { readAccounts, runTeamAction } from './team-service';

function twoEpisodes(): Project {
  const project = createProject('Tide Line', 'series');
  const open = project.episodes[0];
  const concealed = { id: 'episode-secret', season: 1, number: 2, title: 'Restricted ending', synopsis: 'Private content' };
  project.episodes.push(concealed);
  const script = project.documents[0];
  script.blocks.push(newBlock('action', 'A ship waits.'));
  project.documents.push(
    { ...newDocument('Commercial insert', 'av', open.id), avRows: [{ id: 'allowed-row', video: 'A pier', audio: '', durationSeconds: 20, storyboardAssetId: 'allowed-asset' }] },
    { ...newDocument('Secret insert', 'av', concealed.id), avRows: [{ id: 'secret-row', video: 'Unknown', audio: '', durationSeconds: 40, storyboardAssetId: 'secret-asset' }] }
  );
  project.assets = ['allowed-asset', 'secret-asset'].map(id => ({
    id, name: id + '.png', dataUrl: 'data:image/png;base64,QQ==', mime: 'image/png', addedAt: project.createdAt
  }));
  project.modules = { story: { dossier: 'Private series-level content' } };
  return project;
}

const ownerEmail = 'owner@example.test';
const writerEmail = 'writer@example.test';

test('named issue and restore preserve the original revision, block, and episode', () => {
  const original = twoEpisodes();
  const document = original.documents[0];
  const scene = document.blocks[0];
  const action = document.blocks[1];
  const source = sourceFor(original, document, { sceneId: scene.sceneId, blockId: action.id });
  const { project, snapshot } = issueDocument(original, document.id, 'Shooting draft');
  assert.notEqual(project.documents[0].revisionId, document.revisionId);
  assert.equal(resolveSource(project, source)?.blocks[1].text, 'A ship waits.');
  const altered = structuredClone(project);
  altered.documents[0].blocks[1].text = 'A ship moves.';
  const restored = restoreDocument(altered, snapshot.id);
  assert.equal(restored.documents[0].blocks[1].text, 'A ship waits.');
  assert.notEqual(restored.documents[0].revisionId, document.revisionId);
  assert.equal(restored.snapshots[1].document.blocks[1].text, 'A ship moves.');
  preserveSnapshots(project, restored);
  assert.throws(() => preserveSnapshots(restored, { ...restored, snapshots: [] }), /immutable/);
});

test('episode projection excludes restricted documents, modules, snapshots and assets', () => {
  const seed = twoEpisodes();
  const { project } = issueDocument(seed, seed.documents[2].id, 'Restricted draft');
  const grant: TeamGrant = { email: writerEmail, role: 'editor', episodeIds: [project.episodes[0].id] };
  const visible = toVisibleProject(project, grant);
  assert.deepEqual(visible.documents.map(document => document.id), project.documents.slice(0, 2).map(document => document.id));
  assert.deepEqual(visible.assets.map(asset => asset.id), ['allowed-asset']);
  assert.deepEqual(visible.modules, {});
  assert.equal(visible.snapshots.length, 0);
  const hostile = structuredClone(visible);
  hostile.documents[1].avRows[0].storyboardAssetId = 'secret-asset';
  assert.throws(() => applyProjection(project, hostile, grant), /asset outside your episode access/);
  assert.throws(() => applyProjection(project, visible, { ...grant, role: 'reviewer' }), /review access/);
  assert.deepEqual(applyProjection(project, visible, grant).documents, project.documents);
  assert.equal(applyProjection(project, visible, grant).snapshots.length, 1);
  validateProject(project);
});

test('five independent writers merge by stable line IDs; overlapping changes surface the affected line', () => {
  const base = twoEpisodes();
  const script = base.documents[0];
  script.blocks.push(...Array.from({ length: 3 }, (_, index) => newBlock('action', `Line ${index + 3}`)));
  let server = structuredClone(base);
  for (let index = 0; index < 5; index++) {
    const edit = structuredClone(base);
    edit.documents[0].blocks[index].text = `Writer ${index + 1}`;
    const result = mergeTeamProjects(base, edit, server);
    assert.deepEqual(result.conflicts, []);
    server = result.project;
  }
  assert.deepEqual(server.documents[0].blocks.map(block => block.text), Array.from({ length: 5 }, (_, index) => `Writer ${index + 1}`));
  const offline = structuredClone(base);
  offline.documents[0].blocks[0].text = 'An overlapping offline change';
  const concurrent = mergeTeamProjects(base, offline, server);
  assert.deepEqual(concurrent.conflicts, [`project/documents/${script.id}/blocks/${script.blocks[0].id}/text`]);
  assert.equal(concurrent.project.documents[0].blocks[0].text, 'Writer 1');
});

function poolFake(query: (sql: string, args: unknown[]) => unknown[]) {
  const call = async (sql: string, args: unknown[] = []) => ({ rows: query(sql, args) });
  return {
    query: call,
    connect: async () => ({ query: call, release: () => undefined })
  } as unknown as Pool;
}

const sessionKey = 's'.repeat(43);
const accessKey = 'k'.repeat(43);
const keyDigest = createHash('sha256').update(accessKey).digest('hex');
const accounts = readAccounts(JSON.stringify({ [ownerEmail]: keyDigest }));

test('login checks the high-entropy key and stores an opaque revocable session digest', async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const db = poolFake((sql, args) => {
    calls.push({ sql, args });
    return [];
  });
  await assert.rejects(runTeamAction(db, accounts, { action: 'login', email: ownerEmail, key: 'bad' }), /not accepted/);
  assert.equal(calls.length, 0);
  const result = await runTeamAction(db, accounts, { action: 'login', email: ownerEmail, key: accessKey });
  assert.match(result.cookie ?? '', /^swdr_session=[A-Za-z0-9_-]{43}; Max-Age=43200; Path=\/api\/team; Secure; HttpOnly; SameSite=Strict$/);
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].args[0]), /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0].args[0], keyDigest);
  await assert.rejects(runTeamAction(db, accounts, { action: 'open', projectId: 'secret' }), /Sign in/);
});

test('idempotent operation returns its current allowed scope and access changes reject the stale write', async () => {
  const project = twoEpisodes();
  const SQL: string[] = [];
  let role = 'editor';
  let episodeIds: string[] | null = [project.episodes[0].id];
  const db = poolFake(sql => {
    SQL.push(sql);
    if (sql.includes('FROM swdr_team_sessions')) return [{ email: ownerEmail }];
    if (sql.includes('FOR UPDATE')) return [{ body: project, version: 7 }];
    if (sql.includes('FROM swdr_team_grants')) return [{ role, episode_ids: episodeIds }];
    if (sql.includes('FROM swdr_team_operations')) return [{ email: ownerEmail }];
    return [];
  });
  const write = {
    action: 'save', projectId: project.id, operationId: 'operation', version: 5,
    expectedRole: role, expectedEpisodeIds: episodeIds
  };
  const result = await runTeamAction(db, accounts, write, sessionKey);
  assert.equal((result.data as { version: number }).version, 7);
  assert.equal((result.data as { project: Project }).project.documents.length, 2);
  assert.equal(SQL.some(sql => sql.startsWith('UPDATE swdr_team_projects')), false);
  episodeIds = null;
  await assert.rejects(runTeamAction(db, accounts, write, sessionKey), /local edits are still available/);
  role = 'viewer';
  await assert.rejects(runTeamAction(db, accounts, write, sessionKey), /Editing access is required/);
});

test('HTTP rejects wrong method and origin before any store is touched', async () => {
  async function request(method: string, origin: string) {
    const req = Object.assign(Readable.from(['{"action":"session"}']), {
      method, headers: { origin, host: 'swdr.example.test', 'content-type': 'application/json' }
    }) as unknown as IncomingMessage;
    let response = '';
    const headers = new Map<string, string>();
    const res = {
      statusCode: 200,
      setHeader: (key: string, value: string) => { headers.set(key, value); },
      end: (data: string) => { response = data; }
    };
    await handler(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: JSON.parse(response), headers };
  }
  assert.equal((await request('GET', 'https://swdr.example.test')).status, 405);
  const crossSite = await request('POST', 'https://elsewhere.example.test');
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get('Cache-Control'), 'private, no-store');
});

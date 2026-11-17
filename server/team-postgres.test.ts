import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import handler from '../api/team';
import { newBlock, newDocument, newId } from '../src/model';
import type { Project } from '../src/model';
import { createProject, issueDocument, restoreDocument } from '../src/workspace/project';
import type { LineChange, ReviewDocument, TeamGrant, TeamNote, TeamProject, TeamResponse } from '../src/workspace/team-contract';

const databaseUrl = process.env.SWDR_TEST_DATABASE_URL;
type Fields = Record<string, unknown>;

test('PostgreSQL and the HTTP team route', { skip: !databaseUrl }, async t => {
  const connection = new URL(databaseUrl!);
  assert.ok(
    ['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) && /^\/swdr_test_[a-z0-9_]+$/.test(connection.pathname),
    'Use a fresh loopback PostgreSQL database named swdr_test_*.'
  );
  const database = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });
  t.after(async () => { await database.end(); });
  const migration = await readFile(new URL('./team-schema.sql', import.meta.url), 'utf8');
  await database.query(migration);
  await database.query(migration);

  const roles = ['owner', 'writer1', 'writer2', 'reviewer', 'viewer'] as const;
  type AccountRole = typeof roles[number];
  const accounts = Object.fromEntries(roles.map(role => [role, {
    email: `${role}@swdr.test`,
    key: randomBytes(32).toString('base64url')
  }])) as Record<AccountRole, { email: string; key: string }>;
  const sessionCookies = new Map<AccountRole, string>();
  process.env.SWDR_TEAM_DATABASE_URL = databaseUrl;
  process.env.SWDR_TEAM_ACCOUNTS = JSON.stringify(Object.fromEntries(Object.values(accounts).map(account =>
    [account.email, createHash('sha256').update(account.key).digest('hex')]
  )));
  t.after(() => {
    delete process.env.SWDR_TEAM_DATABASE_URL;
    delete process.env.SWDR_TEAM_ACCOUNTS;
  });

  const server = createServer((request, response) => {
    if (request.url === '/api/team') void handler(request, response);
    else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => await new Promise<void>((resolve, reject) => {
    server.close(error => { if (error) reject(error); else resolve(); });
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;

  async function request<T>(actor: AccountRole | undefined, action: string, body: Fields = {}, expect = 200) {
    const cookie = actor ? sessionCookies.get(actor) : undefined;
    const response = await fetch(`${origin}/api/team`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        'sec-fetch-site': 'same-origin',
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify({ ...body, action })
    });
    const payload = await response.json() as TeamResponse<T>;
    assert.equal(response.status, expect, `${actor ?? 'guest'}/${action}: ${payload.error ?? 'unexpected success'}`);
    if (actor && action === 'login' && response.ok) {
      const header = response.headers.get('set-cookie') ?? '';
      assert.match(header, /Secure; HttpOnly; SameSite=Strict/);
      sessionCookies.set(actor, header.split(';')[0]);
    }
    return payload;
  }

  async function open(actor: AccountRole, projectId: string): Promise<TeamProject> {
    const response = await request<TeamProject>(actor, 'open', { projectId });
    assert.ok(response.data);
    return response.data;
  }

  function editLine(base: TeamProject, index: number, text: string): Project {
    const project = structuredClone(base.project);
    project.documents[0].blocks[index].text = text;
    return project;
  }

  function update(base: TeamProject, project: Project, operationId = newId()): Fields {
    return {
      project, projectId: base.project.id, version: base.version, operationId,
      expectedRole: base.grant.role, expectedEpisodeIds: base.grant.episodeIds
    };
  }

  const seed = createProject('Integration fixture', 'series');
  const firstEpisode = seed.episodes[0];
  const secondEpisode = { id: newId(), season: 1, number: 2, title: 'Restricted episode', synopsis: 'A sealed ending' };
  seed.episodes.push(secondEpisode);
  seed.documents[0].blocks = [
    newBlock('scene', 'INT. NEWSROOM — NIGHT'), newBlock('action', 'A printer jams.'), newBlock('action', 'The editor waits.')
  ];
  const mainScript = seed.documents[0];
  const secondScript = newDocument('Restricted manuscript', 'screenplay', secondEpisode.id);
  secondScript.blocks[0].text = 'EXT. RESTRICTED LOCATION — DAY';
  seed.documents.push(secondScript);
  seed.modules = { story: { protected: 'Sample unreleased canon' } };
  const projectId = seed.id;

  await t.test('migrates repeatedly, issues five sessions, enforces role and episode visibility', async () => {
    await request(undefined, 'session', {}, 401);
    await request('owner', 'login', { ...accounts.owner, key: 'invalid synthetic value' }, 401);
    await Promise.all(roles.map(role => request(role, 'login', accounts[role])));
    const created = await request<TeamProject>('owner', 'create', { project: seed });
    assert.equal(created.data?.version, 1);
    await request<TeamGrant[]>('owner', 'grant', { projectId, email: accounts.writer1.email, role: 'editor', episodeIds: [firstEpisode.id] });
    await request<TeamGrant[]>('owner', 'grant', { projectId, email: accounts.writer2.email, role: 'editor', episodeIds: null });
    await request<TeamGrant[]>('owner', 'grant', { projectId, email: accounts.reviewer.email, role: 'reviewer', episodeIds: [firstEpisode.id] });
    await request<TeamGrant[]>('owner', 'grant', { projectId, email: accounts.viewer.email, role: 'viewer', episodeIds: [secondEpisode.id] });
    assert.equal((await open('viewer', projectId)).project.documents[0].id, secondScript.id);
    const firstWriter = await open('writer1', projectId);
    assert.deepEqual(firstWriter.project.documents.map(document => document.id), [mainScript.id]);
    assert.deepEqual(firstWriter.project.modules, {});
    assert.equal((await open('writer2', projectId)).project.documents.length, 2);
    await request('reviewer', 'grants', { projectId }, 403);
    await request('viewer', 'history', { projectId, documentId: mainScript.id, blockId: mainScript.blocks[0].id }, 404);
  });

  await t.test('serializes concurrent writers, rebases disjoint edits, and safely retries a mutation', async () => {
    const [owner, writer1, writer2] = await Promise.all([
      open('owner', projectId), open('writer1', projectId), open('writer2', projectId)
    ]);
    const ownerWork = update(owner, editLine(owner, 0, 'INT. NEWSROOM — MORNING'));
    const edited = await Promise.all([
      request<TeamProject>('owner', 'save', ownerWork),
      request<TeamProject>('writer1', 'save', update(writer1, editLine(writer1, 1, 'The printer is repaired.'))),
      request<TeamProject>('writer2', 'save', update(writer2, editLine(writer2, 2, 'The editor walks out.')))
    ]);
    assert.deepEqual(edited.map(response => response.data?.version).sort(), [2, 3, 4]);
    assert.equal((await request<TeamProject>('owner', 'save', ownerWork)).data?.version, 4);
    const latest = await open('owner', projectId);
    assert.equal(latest.version, 4);
    assert.deepEqual(latest.project.documents[0].blocks.map(block => block.text), [
      'INT. NEWSROOM — MORNING', 'The printer is repaired.', 'The editor walks out.'
    ]);
    assert.equal(latest.project.documents[1].id, secondScript.id);
  });

  await t.test('detects overlapping text and leaves the winning update unchanged', async () => {
    const [owner, writer1] = await Promise.all([open('owner', projectId), open('writer1', projectId)]);
    await request('owner', 'save', update(owner, editLine(owner, 2, 'The editor returns.')));
    const conflict = await request<TeamProject>('writer1', 'save', update(writer1, editLine(writer1, 2, 'The editor stays out.')), 409);
    assert.match(conflict.conflicts?.[0] ?? '', /\/blocks\/.*\/text$/);
    assert.equal(conflict.latest?.project.documents[0].blocks[2].text, 'The editor returns.');
    assert.equal(conflict.latest?.project.documents.length, 1);
  });

  await t.test('accepts a scoped suggestion, logs line history, and restores an earlier line', async () => {
    const reviewer = await open('reviewer', projectId);
    const current = reviewer.project.documents[0];
    const line = current.blocks[2];
    const suggested = await request<TeamNote>('reviewer', 'add-note', {
      projectId, documentId: current.id, revisionId: current.revisionId, blockId: line.id,
      kind: 'suggestion', text: 'The editor heads upstairs.', original: line.text
    });
    assert.ok(suggested.data);
    await request('viewer', 'add-note', {
      projectId, documentId: secondScript.id, revisionId: secondScript.revisionId, blockId: secondScript.blocks[0].id,
      kind: 'comment', text: 'Viewer cannot add comments'
    }, 403);
    const accepted = await request<TeamProject>('owner', 'settle-note', {
      projectId, noteId: suggested.data.id, state: 'accepted'
    });
    assert.equal(accepted.data?.project.documents[0].blocks[2].text, 'The editor heads upstairs.');
    const history = (await request<LineChange[]>('reviewer', 'history', { projectId, documentId: current.id, blockId: line.id })).data ?? [];
    assert.equal(history[0].text, 'The editor heads upstairs.');
    assert.equal(history[0].previous, 'The editor returns.');
    const restored = await request<TeamProject>('owner', 'restore-line', {
      projectId, documentId: current.id, blockId: line.id,
      version: accepted.data?.version, changeVersion: history[0].version, restorePrevious: true
    });
    assert.equal(restored.data?.project.documents[0].blocks[2].text, 'The editor returns.');
    assert.equal(restored.data?.version, (accepted.data?.version ?? 0) + 1);
  });

  await t.test('preserves issued snapshots through restore, enforces guest expiry and revocation', async () => {
    const owner = await open('owner', projectId);
    const issue = issueDocument(owner.project, mainScript.id, 'Issued fixture');
    assert.ok((await request<TeamProject>('owner', 'save', update(owner, issue.project))).data);
    const afterIssue = await open('owner', projectId);
    const tamper = structuredClone(afterIssue.project);
    tamper.snapshots[0].document.blocks[0].text = 'Changed archival content';
    await request('owner', 'save', update(afterIssue, tamper), 422);
    const restored = restoreDocument(afterIssue.project, issue.snapshot.id);
    const saved = await request<TeamProject>('owner', 'save', update(afterIssue, restored));
    const head = saved.data?.project.documents[0];
    assert.notEqual(head?.revisionId, issue.snapshot.document.revisionId);
    assert.equal(saved.data?.project.snapshots[0].document.blocks[0].id, head?.blocks[0].id);
    assert.equal(saved.data?.project.snapshots.length, 2);
    const link = (await request<{ key: string }>('owner', 'create-review', {
      projectId, snapshotId: issue.snapshot.id, hours: 1
    })).data;
    assert.ok(link);
    const review = (await request<ReviewDocument>(undefined, 'review', { key: link.key })).data;
    assert.equal(review?.snapshot.document.revisionId, issue.snapshot.document.revisionId);
    assert.equal(Object.hasOwn(review ?? {}, 'assets'), false);
    await database.query(
      "UPDATE swdr_team_reviews SET expires_at = now() - interval '1 second' WHERE project_id = $1",
      [projectId]
    );
    await request(undefined, 'review', { key: link.key }, 404);
    const liveLink = (await request<{ key: string }>('owner', 'create-review', {
      projectId, snapshotId: issue.snapshot.id, hours: 1
    })).data;
    assert.ok(liveLink);
    await request('owner', 'revoke-review', { projectId, key: liveLink.key });
    await request(undefined, 'review', { key: liveLink.key }, 404);
  });

  await t.test('revokes new reads and queued writes immediately', async () => {
    const writer = await open('writer1', projectId);
    await request('owner', 'grant', { projectId, email: accounts.writer1.email, role: null, episodeIds: null });
    await request('writer1', 'open', { projectId }, 404);
    await request('writer1', 'save', update(writer, editLine(writer, 0, 'Queued offline text')), 404);
    assert.deepEqual((await request<unknown[]>('writer1', 'list')).data, []);
  });
});

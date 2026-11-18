import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import handler from '../api/team';
import { newDocument, newId } from '../src/model';
import type { Project } from '../src/model';
import { createProject } from '../src/workspace/project';
import type {
  TeamAccount, TeamConfig, TeamInvitation, TeamInvitePreview, TeamInviteIssued, TeamListing, TeamMember, TeamProject,
  TeamResponse, TeamSignedIn
} from '../src/workspace/team-contract';
import { createWorkspaceInvitation } from './team-invitations';

const databaseUrl = process.env.SWDR_TEST_DATABASE_URL;
type Fields = Record<string, unknown>;

test('accounts, invitations and membership against PostgreSQL over HTTP', { skip: !databaseUrl }, async t => {
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

  const run = randomBytes(4).toString('hex');
  const keyHolder = { email: `keys-${run}@accounts.test`, key: randomBytes(32).toString('base64url') };
  process.env.SWDR_TEAM_DATABASE_URL = databaseUrl;
  process.env.SWDR_TEAM_ACCOUNTS = JSON.stringify({ [keyHolder.email]: createHash('sha256').update(keyHolder.key).digest('hex') });
  delete process.env.SWDR_TEAM_SIGNUP;
  t.after(() => {
    delete process.env.SWDR_TEAM_DATABASE_URL;
    delete process.env.SWDR_TEAM_ACCOUNTS;
    delete process.env.SWDR_TEAM_SIGNUP;
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

  const cookies = new Map<string, string>();
  const email = (who: string) => `${who}-${run}@accounts.test`;
  const passwords = new Map<string, string>();
  const passwordOf = (who: string) => {
    if (!passwords.has(who)) passwords.set(who, `${who} walks to set ${randomBytes(6).toString('hex')}`);
    return passwords.get(who)!;
  };

  async function call<T>(actor: string | undefined, action: string, body: Fields = {}, expect = 200, ip = `198.51.100.${actor?.length ?? 1}`) {
    const cookie = actor ? cookies.get(actor) : undefined;
    const response = await fetch(`${origin}/api/team`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', 'x-real-ip': ip,
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify({ ...body, action })
    });
    const payload = await response.json() as TeamResponse<T>;
    assert.equal(response.status, expect, `${actor ?? 'guest'}/${action}: ${payload.error ?? 'unexpected success'}`);
    const header = response.headers.get('set-cookie');
    if (actor && header && response.ok) {
      assert.match(header, /; Path=\/api\/team; Secure; HttpOnly; SameSite=Strict$/);
      cookies.set(actor, header.split(';')[0]);
    }
    return payload;
  }

  async function signUp(who: string, invite?: string, expect = 200) {
    return call<TeamSignedIn>(who, 'sign-up', { name: `${who[0].toUpperCase()}${who.slice(1)} Tester`, email: email(who), password: passwordOf(who), invite }, expect);
  }

  const seed: Project = createProject('Harbour Lights', 'series');
  const pilot = seed.episodes[0];
  const finale = { id: newId(), season: 1, number: 2, title: 'Finale', synopsis: 'Sealed' };
  seed.episodes.push(finale);
  seed.documents.push(newDocument('Finale script', 'screenplay', finale.id));
  const projectId = seed.id;
  let writerInvite: TeamInviteIssued;

  await t.test('invite-only bootstrap: the first owner joins through a workspace invitation', async () => {
    assert.deepEqual((await call<TeamConfig>(undefined, 'config')).data, { signup: 'invite', accessKeys: true });
    await signUp('owner', undefined, 403);
    const bootstrap = await createWorkspaceInvitation(database, email('owner'), 'workspace operator');
    const preview = (await call<TeamInvitePreview>(undefined, 'invitation', { token: bootstrap.token })).data;
    assert.equal(preview?.projectTitle, null);
    assert.equal(preview?.accountExists, false);
    await call('intruder', 'sign-up', { name: 'Intruder', email: email('intruder'), password: passwordOf('intruder'), invite: bootstrap.token }, 403);
    const joined = (await signUp('owner', bootstrap.token)).data;
    assert.equal(joined?.account.email, email('owner'));
    assert.equal(joined?.projectId, undefined);
    assert.match(cookies.get('owner') ?? '', /^swdr_session=[A-Za-z0-9_-]{43}$/);
    await call('again', 'sign-up', { name: 'Again', email: email('owner'), password: passwordOf('owner'), invite: bootstrap.token }, 410);
    const stored = await database.query('SELECT scheme, length(salt) AS salt, length(hash) AS hash FROM swdr_team_credentials WHERE email = $1', [email('owner')]);
    assert.deepEqual(stored.rows[0], { scheme: 'scrypt:N=32768,r=8,p=1,len=32', salt: 16, hash: 32 });
    const sessions = await database.query<{ digest: string }>('SELECT digest FROM swdr_team_sessions WHERE email = $1', [email('owner')]);
    assert.equal(sessions.rows.some(row => (cookies.get('owner') ?? '').includes(row.digest)), false);
  });

  await t.test('an owner invites a scoped writer who joins by link and sees only that episode', async () => {
    assert.equal((await call<TeamProject>('owner', 'create', { project: seed })).data?.grant.role, 'owner');
    writerInvite = (await call<TeamInviteIssued>('owner', 'invite', { projectId, email: ` ${email('writer').toUpperCase()} `, role: 'editor', episodeIds: [pilot.id] })).data!;
    assert.match(writerInvite.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(writerInvite.invitation.email, email('writer'));
    const stored = await database.query('SELECT digest FROM swdr_team_invitations WHERE id = $1', [writerInvite.invitation.id]);
    assert.notEqual(stored.rows[0].digest, writerInvite.token);
    const preview = (await call<TeamInvitePreview>(undefined, 'invitation', { token: writerInvite.token })).data;
    assert.equal(preview?.projectTitle, 'Harbour Lights');
    assert.equal(preview?.role, 'editor');
    assert.equal(preview?.invitedBy, 'Owner Tester');
    assert.deepEqual(preview?.episodeTitles, [`S1 · E1 · ${pilot.title}`]);
    await call('owner', 'invite', { projectId, email: email('writer'), role: 'editor', episodeIds: ['missing'] }, 400);
    const joined = (await signUp('writer', writerInvite.token)).data;
    assert.equal(joined?.projectId, projectId);
    const listing = (await call<TeamListing[]>('writer', 'list')).data;
    assert.deepEqual(listing?.map(item => [item.id, item.role]), [[projectId, 'editor']]);
    const opened = (await call<TeamProject>('writer', 'open', { projectId })).data!;
    assert.deepEqual(opened.project.documents.map(document => document.episodeId), [pilot.id]);
    await call('writer', 'invite', { projectId, email: email('other'), role: 'viewer', episodeIds: null }, 403);
    await call('writer', 'grants', { projectId }, 403);
    await call('owner', 'invite', { projectId, email: email('writer'), role: 'viewer', episodeIds: null }, 409);
  });

  await t.test('members list, role change to viewer stops edits, scope change widens access', async () => {
    const members = (await call<TeamMember[]>('owner', 'grants', { projectId })).data!;
    assert.deepEqual(members.map(member => [member.email, member.role, member.name]), [
      [email('owner'), 'owner', 'Owner Tester'], [email('writer'), 'editor', 'Writer Tester']
    ]);
    assert.ok(members[1].lastActiveAt && members[1].addedAt);
    const before = (await call<TeamProject>('writer', 'open', { projectId })).data!;
    const edit = structuredClone(before.project);
    edit.documents[0].blocks[0].text = 'INT. HARBOUR — NIGHT';
    const save = (base: TeamProject, project: Project) => ({
      projectId, project, version: base.version, operationId: newId(), expectedRole: base.grant.role, expectedEpisodeIds: base.grant.episodeIds
    });
    assert.equal((await call<TeamProject>('writer', 'save', save(before, edit))).data?.version, 2);
    await call('owner', 'grant', { projectId, email: email('writer'), role: 'viewer', episodeIds: [pilot.id] });
    const denied = await call<TeamProject>('writer', 'save', save({ ...before, version: 2 }, edit), 403);
    assert.match(denied.error ?? '', /Editing access is required/);
    assert.equal((await call<TeamProject>('writer', 'open', { projectId })).data?.grant.role, 'viewer');
    await call('owner', 'grant', { projectId, email: email('writer'), role: 'viewer', episodeIds: null });
    assert.equal((await call<TeamProject>('writer', 'open', { projectId })).data?.project.documents.length, 2);
  });

  await t.test('pending invitations can be listed, re-issued (old link dies) and revoked', async () => {
    const issued = (await call<TeamInviteIssued>('owner', 'invite', { projectId, email: email('reviewer'), role: 'reviewer', episodeIds: null, days: 3 })).data!;
    let pending = (await call<TeamInvitation[]>('owner', 'invitations', { projectId })).data!;
    assert.deepEqual(pending.map(item => [item.email, item.role, item.expired]), [[email('reviewer'), 'reviewer', false]]);
    const fresh = (await call<TeamInviteIssued>('owner', 'reissue-invite', { projectId, invitationId: issued.invitation.id })).data!;
    assert.notEqual(fresh.token, issued.token);
    await call(undefined, 'invitation', { token: issued.token }, 404);
    assert.equal((await call<TeamInvitePreview>(undefined, 'invitation', { token: fresh.token })).data?.role, 'reviewer');
    pending = (await call<TeamInvitation[]>('owner', 'revoke-invite', { projectId, invitationId: issued.invitation.id })).data!;
    assert.deepEqual(pending, []);
    await call(undefined, 'invitation', { token: fresh.token }, 404);
    await call('owner', 'reissue-invite', { projectId, invitationId: issued.invitation.id }, 404);
    const expiring = (await call<TeamInviteIssued>('owner', 'invite', { projectId, email: email('late'), role: 'viewer', episodeIds: null })).data!;
    await database.query("UPDATE swdr_team_invitations SET expires_at = now() - interval '1 second' WHERE id = $1", [expiring.invitation.id]);
    await call(undefined, 'invitation', { token: expiring.token }, 410);
    assert.equal((await call<TeamInvitation[]>('owner', 'invitations', { projectId })).data?.[0].expired, true);
    await signUp('late', expiring.token, 410);
  });

  await t.test('a signed-in person accepts in one click only with the matching email', async () => {
    process.env.SWDR_TEAM_SIGNUP = 'open';
    assert.equal((await call<TeamConfig>(undefined, 'config')).data?.signup, 'open');
    assert.equal((await signUp('critic')).data?.projectId, undefined);
    assert.deepEqual((await call<TeamListing[]>('critic', 'list')).data, []);
    await call('critic', 'open', { projectId }, 404);
    await signUp('critic', undefined, 409);
    const issued = (await call<TeamInviteIssued>('owner', 'invite', { projectId, email: email('critic'), role: 'reviewer', episodeIds: [finale.id] })).data!;
    assert.equal((await call<TeamInvitePreview>(undefined, 'invitation', { token: issued.token })).data?.accountExists, true);
    await call('writer', 'accept-invite', { token: issued.token }, 403);
    assert.equal((await call<TeamSignedIn>('critic', 'accept-invite', { token: issued.token })).data?.projectId, projectId);
    assert.deepEqual((await call<TeamProject>('critic', 'open', { projectId })).data?.project.documents.map(document => document.episodeId), [finale.id]);
    await call('critic', 'accept-invite', { token: issued.token }, 410);
    // Grants are keyed by email: a new account must not inherit a leftover grant.
    await database.query("INSERT INTO swdr_team_grants (project_id, email, role) VALUES ($1, $2, 'editor')", [projectId, email('ghost')]);
    await signUp('ghost', undefined, 409);
    await call('nobody', 'sign-up', { name: 'Key thief', email: keyHolder.email, password: passwordOf('nobody') }, 409);
    process.env.SWDR_TEAM_SIGNUP = 'sometimes';
    await call(undefined, 'config', {}, 503);
    delete process.env.SWDR_TEAM_SIGNUP;
  });

  await t.test('sign-in throttles guesses per email with backoff; sign-out and expiry end sessions', async () => {
    cookies.delete('writer');
    await call('writer', 'sign-in', { email: email('writer'), password: passwordOf('writer') });
    for (let attempt = 0; attempt < 5; attempt++) {
      await call(undefined, 'sign-in', { email: email('writer'), password: `wrong guess ${attempt}x` }, 401, `192.0.2.${attempt}`);
    }
    const locked = await call(undefined, 'sign-in', { email: email('writer'), password: passwordOf('writer') }, 429, '192.0.2.99');
    assert.match(locked.error ?? '', /Too many attempts/);
    await call(undefined, 'sign-in', { email: email('nobody-here'), password: 'any password at all' }, 401, '192.0.2.98');
    await database.query("UPDATE swdr_team_login_attempts SET locked_until = now() - interval '1 second'");
    await call('writer2', 'sign-in', { email: email('writer'), password: passwordOf('writer') });
    assert.equal((await call<TeamAccount>('writer2', 'session')).data?.method, 'password');
    await call('writer2', 'logout');
    cookies.set('writer2-old', cookies.get('writer2')!);
    await call('writer2', 'session', {}, 401);
    await database.query("UPDATE swdr_team_sessions SET expires_at = now() - interval '1 second' WHERE email = $1", [email('writer')]);
    await call('writer', 'session', {}, 401);
    await call('writer', 'sign-in', { email: email('writer'), password: passwordOf('writer') });
    assert.equal((await call<TeamAccount>('writer', 'session')).data?.name, 'Writer Tester');
  });

  await t.test('removing a member ends their access and their pending invitations', async () => {
    const issued = (await call<TeamInviteIssued>('owner', 'invite', { projectId, email: email('pending'), role: 'viewer', episodeIds: null })).data!;
    await call('owner', 'grant', { projectId, email: email('pending'), role: null, episodeIds: null });
    await call(undefined, 'invitation', { token: issued.token }, 404);
    await call('owner', 'grant', { projectId, email: email('writer'), role: null, episodeIds: null });
    await call('writer', 'open', { projectId }, 404);
    assert.deepEqual((await call<TeamListing[]>('writer', 'list')).data, []);
    await call('owner', 'grant', { projectId, email: email('owner'), role: null, episodeIds: null }, 400);
    await call('owner', 'grant', { projectId, email: email('writer'), role: 'viewer', episodeIds: null }, 400);
  });

  await t.test('operator access keys still work and can add a password', async () => {
    await call('keys', 'login', keyHolder);
    assert.deepEqual((await call<TeamAccount>('keys', 'session')).data, { email: keyHolder.email, name: '', method: 'access-key', hasPassword: false });
    await call('owner', 'grant', { projectId, email: keyHolder.email, role: 'reviewer', episodeIds: null });
    assert.equal((await call<TeamProject>('keys', 'open', { projectId })).data?.grant.role, 'reviewer');
    await call('keys', 'set-password', { password: 'short' }, 400);
    assert.equal((await call<TeamAccount>('keys', 'set-password', { password: passwordOf('keys'), name: 'Key Holder' })).data?.hasPassword, true);
    await call('keys', 'set-password', { password: passwordOf('keys') }, 409);
    await call('keys2', 'sign-in', { email: keyHolder.email, password: passwordOf('keys') });
    assert.equal((await call<TeamAccount>('keys2', 'session')).data?.name, 'Key Holder');
  });
});

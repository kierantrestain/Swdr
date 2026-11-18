import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TeamSignupMode } from '../src/workspace/team-contract.js';
import { TeamFault } from './team-model.js';

/** Opaque 256-bit tokens (sessions, invitations, review links) are 43 base64url characters. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const ACCESS_KEY_SESSION_SECONDS = 12 * 3600;
export const PASSWORD_SESSION_SECONDS = 7 * 24 * 3600;
export const INVITATION_DAYS = 7;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 256;

type Queryable = Pool | PoolClient;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 digests, so a database read does not reveal a usable secret. */
export function tokenDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sessionCookie(value: string, maxAge: number): string {
  // Strict is a superset of Lax: the cookie is only ever needed by same-origin fetches to /api/team.
  return `swdr_session=${value}; Max-Age=${maxAge}; Path=/api/team; Secure; HttpOnly; SameSite=Strict`;
}

export function readSignupMode(value?: string): TeamSignupMode {
  const mode = (value ?? '').trim().toLowerCase();
  if (!mode || mode === 'invite') return 'invite';
  if (mode === 'open') return 'open';
  // A typo must not silently open the workspace.
  throw new TeamFault(503, 'Private team access is not configured.');
}

// scrypt with N=2^15, r=8, p=1 costs 32 MiB and roughly 50-100 ms per guess.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32 } as const;
export const PASSWORD_SCHEME = `scrypt:N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p},len=${SCRYPT.keylen}`;

function scrypt(password: string, salt: Buffer, params: typeof SCRYPT): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r };
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize('NFKC'), salt, params.keylen, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function parseScheme(scheme: string): typeof SCRYPT | undefined {
  const match = /^scrypt:N=(\d+),r=(\d+),p=(\d+),len=(\d+)$/.exec(scheme);
  if (!match) return undefined;
  const [N, r, p, keylen] = match.slice(1).map(Number);
  if (N < 16384 || N > 1048576 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16 || keylen < 16 || keylen > 64) {
    return undefined;
  }
  return { N, r, p, keylen } as unknown as typeof SCRYPT;
}

export interface PasswordHash {
  scheme: string;
  salt: Buffer;
  hash: Buffer;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  return { scheme: PASSWORD_SCHEME, salt, hash: await scrypt(password, salt, SCRYPT) };
}

let decoy: Promise<PasswordHash> | undefined;

/**
 * Compares in constant time. With no stored hash it still derives a decoy key so an unknown email
 * takes as long as a wrong password.
 */
export async function verifyPassword(password: string, stored?: PasswordHash): Promise<boolean> {
  const target = stored ?? await (decoy ??= hashPassword(newToken()));
  const params = parseScheme(target.scheme);
  if (!params) return false;
  const derived = await scrypt(password, target.salt, params);
  return derived.length === target.hash.length && timingSafeEqual(derived, target.hash) && stored !== undefined;
}

const COMMON = new Set([
  'password123', 'password1234', 'password12345', 'passw0rd123', '1234567890', '12345678910', '0123456789',
  'qwertyuiop', 'qwerty12345', 'qwerty123456', '1q2w3e4r5t', 'iloveyou123', 'letmein123', 'welcome123',
  'abcdefghij', 'abcd123456', 'aaaaaaaaaa', 'football123', 'baseball123', 'princess123', 'sunshine123',
  'trustno1234', 'starwars123', 'dragon12345', 'monkey12345', 'screenplay', 'screenwriter', 'swdrswdrswdr'
]);

/** Returns a human-readable reason when the password is unacceptable. */
export function passwordProblem(password: unknown, email: string): string | undefined {
  if (typeof password !== 'string') return 'Enter a password.';
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password.`;
  if (length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters for your password.`;
  const folded = password.normalize('NFKC').toLowerCase();
  if (!folded.trim()) return 'A password cannot be only spaces.';
  if (new Set(folded).size < 4) return 'Use a password with more variety than a repeated character.';
  if (folded === email || folded === email.split('@')[0]) return 'Your password cannot be your email address.';
  if (COMMON.has(folded)) return 'That password is too common. Choose a longer phrase.';
  return undefined;
}

export function requirePassword(password: unknown, email: string): string {
  const problem = passwordProblem(password, email);
  if (problem) throw new TeamFault(400, problem);
  return password as string;
}

// --- Attempt throttling -----------------------------------------------------------------------

export interface ThrottleRule {
  scope: string;
  /** Failures within the rolling hour before the scope is locked. */
  limit: number;
}

function scopeKey(kind: string, value: string): string {
  return `${kind}:${tokenDigest(value)}`;
}

export function signInRules(email: string, address: string): ThrottleRule[] {
  return [
    { scope: scopeKey('email', email), limit: 5 },
    { scope: scopeKey('ip', address), limit: 30 }
  ];
}

export function signUpRules(address: string): ThrottleRule[] {
  return [{ scope: scopeKey('signup', address), limit: 10 }];
}

/** Lock duration after `failures` attempts: 30 s doubling per extra failure, capped at 15 minutes. */
export function lockSeconds(failures: number, limit: number): number {
  if (failures < limit) return 0;
  return Math.min(900, 30 * 2 ** Math.min(failures - limit, 10));
}

export async function assertNotThrottled(db: Queryable, rules: ThrottleRule[]): Promise<void> {
  const result = await db.query<{ wait: number }>(
    `SELECT ceil(extract(epoch FROM max(locked_until) - now()))::int AS wait
     FROM swdr_team_login_attempts WHERE scope = ANY($1::text[]) AND locked_until > now()`,
    [rules.map(rule => rule.scope)]
  );
  const wait = result.rows[0]?.wait;
  if (wait && wait > 0) {
    const minutes = Math.max(1, Math.ceil(wait / 60));
    throw new TeamFault(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

export async function recordAttempt(db: Queryable, rules: ThrottleRule[]): Promise<void> {
  for (const rule of rules) {
    const result = await db.query<{ failures: number }>(
      `INSERT INTO swdr_team_login_attempts AS a (scope, failures, window_started_at) VALUES ($1, 1, now())
       ON CONFLICT (scope) DO UPDATE SET
         failures = CASE WHEN a.window_started_at < now() - interval '1 hour' THEN 1 ELSE a.failures + 1 END,
         window_started_at = CASE WHEN a.window_started_at < now() - interval '1 hour' THEN now() ELSE a.window_started_at END
       RETURNING failures`,
      [rule.scope]
    );
    const seconds = lockSeconds(result.rows[0]?.failures ?? 0, rule.limit);
    if (seconds) {
      await db.query(
        'UPDATE swdr_team_login_attempts SET locked_until = now() + make_interval(secs => $2) WHERE scope = $1',
        [rule.scope, seconds]
      );
    }
  }
}

export async function clearAttempts(db: Queryable, rules: ThrottleRule[]): Promise<void> {
  await db.query('DELETE FROM swdr_team_login_attempts WHERE scope = ANY($1::text[])', [rules.map(rule => rule.scope)]);
  await db.query(
    `DELETE FROM swdr_team_login_attempts
     WHERE window_started_at < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())`
  );
}

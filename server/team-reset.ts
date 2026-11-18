/**
 * Password reset by email through Resend. Links are single-use, expire after an hour, are stored only as
 * a digest, and the response never reveals whether an email has an account. Completing a reset signs
 * out every other session for that account.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { assertNotThrottled, hashPassword, newToken, recordAttempt, requirePassword, TOKEN, tokenDigest } from './team-auth.js';
import { emailField, TeamFault } from './team-model.js';

type Env = Record<string, string | undefined>;

/** The workspace owner's recovery key (SWDR_RECOVERY_KEY, at least 24 characters): resets a password without email. */
export const recoveryEnabled = (env: Env = process.env) => (env.SWDR_RECOVERY_KEY?.trim().length ?? 0) >= 24;

export const resetEnabled = (env: Env = process.env) => Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim());

const escape = (text: string) => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

export async function requestReset(db: Pool, body: Record<string, unknown>, origin: string, address: string, env: Env = process.env): Promise<{ sent: true }> {
  if (!resetEnabled(env)) throw new TeamFault(503, 'Password reset by email is not set up on this workspace yet. Ask the workspace owner.');
  const email = emailField(body.email);
  const rules = [{ scope: `reset:${tokenDigest(email)}`, limit: 3 }, { scope: `reset-ip:${tokenDigest(address)}`, limit: 10 }];
  await assertNotThrottled(db, rules);
  await recordAttempt(db, rules);
  const account = await db.query<{ name: string }>(
    'SELECT u.name FROM swdr_team_users u JOIN swdr_team_credentials c ON c.email = u.email WHERE u.email = $1', [email]
  );
  // The same answer either way, so the form cannot be used to find out who has an account.
  if (!account.rows[0]) return { sent: true };
  const token = newToken();
  await db.query("UPDATE swdr_team_resets SET used_at = now() WHERE email = $1 AND used_at IS NULL", [email]);
  await db.query("INSERT INTO swdr_team_resets (digest, email, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [tokenDigest(token), email]);
  const link = `${origin}/#team?reset=${token}`;
  const response = await fetch(`${env.SWDR_RESEND_API ?? 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM, to: [email], subject: 'Reset your SWDR password',
      text: `Hi ${account.rows[0].name || 'there'},\n\nSomeone asked to reset the password for your SWDR account. Open this link within an hour to choose a new one:\n\n${link}\n\nIf it wasn't you, ignore this email; your password stays the same.`,
      html: `<p>Hi ${escape(account.rows[0].name || 'there')},</p><p>Someone asked to reset the password for your SWDR account. Open this link within an hour to choose a new one:</p><p><a href="${escape(link)}">Choose a new password</a></p><p>If it wasn't you, ignore this email; your password stays the same.</p>`
    })
  });
  if (!response.ok) {
    console.error('SWDR reset email failed', response.status);
    throw new TeamFault(502, 'The reset email could not be sent. Try again shortly.');
  }
  return { sent: true };
}

/** Sets the new password for a valid link, ends every existing session and returns the email to sign in. */
export async function completeReset(db: Pool, body: Record<string, unknown>): Promise<string> {
  const token = typeof body.token === 'string' && TOKEN.test(body.token) ? body.token : undefined;
  if (!token) throw new TeamFault(400, 'This reset link is not valid.');
  const expired = () => new TeamFault(410, 'This reset link has expired or was already used. Ask for a new one.');
  const found = await db.query<{ email: string }>('SELECT email FROM swdr_team_resets WHERE digest = $1 AND used_at IS NULL AND expires_at > now()', [tokenDigest(token)]);
  const email = found.rows[0]?.email;
  if (!email) throw expired();
  // Check the new password before using up the link, so a typo does not waste it.
  const credential = await hashPassword(requirePassword(body.password, email));
  const claimed = await db.query('UPDATE swdr_team_resets SET used_at = now() WHERE digest = $1 AND used_at IS NULL AND expires_at > now()', [tokenDigest(token)]);
  if (claimed.rowCount !== 1) throw expired();
  await db.query('UPDATE swdr_team_credentials SET scheme = $2, salt = $3, hash = $4 WHERE email = $1', [email, credential.scheme, credential.salt, credential.hash]);
  await db.query('DELETE FROM swdr_team_sessions WHERE email = $1', [email]);
  return email;
}

/**
 * Resets a password with the workspace recovery key instead of an email link. Only someone who can read
 * the hosting settings knows the key. Attempts are rate-limited, and every other session ends.
 */
export async function recoverWithKey(db: Pool, body: Record<string, unknown>, address: string, env: Env = process.env): Promise<string> {
  if (!recoveryEnabled(env)) throw new TeamFault(503, 'Password recovery is not set up on this workspace.');
  const rules = [{ scope: `recovery-ip:${tokenDigest(address)}`, limit: 5 }];
  await assertNotThrottled(db, rules);
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const given = typeof body.key === 'string' ? body.key.trim() : '';
  if (!given || !timingSafeEqual(digest(given), digest(env.SWDR_RECOVERY_KEY!.trim()))) {
    await recordAttempt(db, rules);
    throw new TeamFault(401, 'That recovery key is not right.');
  }
  const email = emailField(body.email);
  const user = await db.query('SELECT 1 FROM swdr_team_users WHERE email = $1', [email]);
  if (!user.rows[0]) throw new TeamFault(404, 'There is no account with that email.');
  const credential = await hashPassword(requirePassword(body.password, email));
  await db.query(
    `INSERT INTO swdr_team_credentials (email, scheme, salt, hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET scheme = EXCLUDED.scheme, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
    [email, credential.scheme, credential.salt, credential.hash]
  );
  await db.query('DELETE FROM swdr_team_sessions WHERE email = $1', [email]);
  return email;
}

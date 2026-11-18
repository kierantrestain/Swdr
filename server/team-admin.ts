/**
 * Operator command line for the hosted team workspace.
 *
 *   SWDR_TEAM_DATABASE_URL=… node --import tsx server/team-admin.ts invite owner@example.com --origin https://swdr.example.com
 *
 * `invite` issues a workspace invitation: a single-use, expiring link that lets that email create an
 * account even when SWDR_TEAM_SIGNUP is "invite". Use it to create the first owner. The link is printed
 * once; only its SHA-256 digest is stored.
 */
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { createWorkspaceInvitation } from './team-invitations.js';
import { teamDatabaseUrl } from './team-migrate.js';

export function invitationLink(origin: string, token: string): string {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new Error('Use the https:// address of your deployment.');
  }
  return `${base.origin}/#team?invite=${token}`;
}

async function main(argv: string[]): Promise<void> {
  const [command, email, ...rest] = argv;
  const option = (name: string) => {
    const index = rest.indexOf(`--${name}`);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  if (command !== 'invite' || !email || !option('origin')) {
    console.error('Usage: node --import tsx server/team-admin.ts invite <email> --origin <https://your-deployment> [--days 1-30]');
    process.exitCode = 2;
    return;
  }
  const connectionString = teamDatabaseUrl();
  if (!connectionString) {
    console.error('Set SWDR_TEAM_DATABASE_URL in the environment (it is not printed).');
    process.exitCode = 2;
    return;
  }
  invitationLink(option('origin')!, 'check');
  const days = Number(option('days') ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('--days must be a whole number from 1 to 30.');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const issued = await createWorkspaceInvitation(pool, email, 'workspace operator', days);
    console.log(`Workspace invitation for ${issued.invitation.email}, valid until ${issued.invitation.expiresAt}:`);
    console.log(invitationLink(option('origin')!, issued.token));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

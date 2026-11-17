# Workspace data and private team setup

## Local work

Create or import a project from Home, edit the script, and reopen it after the save indicator confirms the local write. SWDR stores project state in IndexedDB under the browser origin. Recent edits also use a compact recovery journal when browser storage is available. Choose **Export archive** to back up projects beyond the current browser profile. The local project store checks for concurrent writes from another tab and keeps an edit pending if its saved base changed.

**Name draft**, **Stash** and **Issue** capture an immutable draft revision. Restore creates a new working revision and keeps the previous working copy in the draft history. The original issue and its block and scene IDs remain available to source links.

## Private hosted team on Vercel

1. Create an SWDR Vercel project from the intended repository branch and apply the project's access protection before sharing a preview. Enable Vercel Authentication for the intended deployment URLs. Unauthenticated share links to an issued draft still require any Vercel-level access configured for the deployment.
2. Create a dedicated PostgreSQL database. Apply the schema using a database migration account. Supply the application connection string in the command environment without printing it.

   ```bash
   psql "$SWDR_TEAM_DATABASE_URL" --set ON_ERROR_STOP=1 --file server/team-schema.sql
   ```

3. Generate a random 32-byte access key and SHA-256 digest per account. Run the command locally for each account. Give the access key to the intended user over a private channel. The Vercel environment receives the digest.

   ```bash
   node --input-type=module -e 'import { randomBytes, createHash } from "node:crypto"; const key = randomBytes(32).toString("base64url"); console.log("Access key:", key); console.log("SHA-256:", createHash("sha256").update(key).digest("hex"));'
   ```

4. Set **SWDR_TEAM_DATABASE_URL** and **SWDR_TEAM_ACCOUNTS** as server-side, sensitive environment variables for the desired deployment environment. The second value is a JSON object mapping each configured email to its 64-character hex digest. Format example with placeholders.

   ```json
   {"owner@example.test":"<64-character SHA-256 digest>","writer@example.test":"<64-character SHA-256 digest>"}
   ```

5. Build and deploy the branch. Open **Private team**, sign in, and create a private copy of a local project. In **Access**, add a provisioned teammate as editor, reviewer or viewer. You can apply the grant to the whole project or an episode. Scoped members can see their documents, their drafts and their referenced AV images. Whole-project story and production metadata is withheld from episode-scoped members.
6. For a hosted smoke test, open separate browser profiles for the owner and a writer. Edit distinct lines, then the same line, and observe sync and conflict handling. Disconnect one writer, edit, wait for **Saved locally**, restart, then reconnect. Check line history, suggestions, access removal and review-link revalidation. A team project can accept concurrent pushes while the local writer is offline. Keep the synced draft or stash conflicting script changes before reopening it.

The application route is a same-origin Vercel function at `/api/team`. Without the server variables it fails closed. For local endpoint development, run from a Vercel-linked checkout with the two environment variables and Postgres schema above using `vercel dev`. Open the localhost URL it reports. The Vite-only local command serves the browser workspace. Use production HTTPS for deployed team access.

Project updates have retry IDs and database transaction locks. A rebase can merge distinct block changes and detect overlapping moves or edits. Feedback and line history are scoped to an accessible document; an accepted suggestion checks that its original line is still current. Review access uses an expiring, revocable link to one issued script. Keep browser profiles separate for test accounts. Sign out after pending edits sync or are resolved.

## Verification and current bounds

Run the workspace service tests with `node --import tsx --test server/team-model.test.ts`. This covers snapshot restore, episode and asset projection, five writers' line merges, overlapping edits, access key handling, idempotent retries, scope changes, and HTTP origin enforcement. The service tests use an in-process query double. A real PostgreSQL instance is required for transaction, migration and hosted smoke testing.

The hosted service uses short polling and retains 100 recent merge bases. After the merge window, reopen the current draft and stash any conflicting script before editing. The IndexedDB team cache resumes the active draft for up to 12 hours from its last confirmed online access. A disconnected machine cannot check revocation until it reconnects. The browser clears a cached draft when the server reports that access was withdrawn. The hosted request size is 4 MB including embedded assets and drafts. Use local archive storage for larger projects.

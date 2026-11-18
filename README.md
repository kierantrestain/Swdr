# SWDR

**A private writing and production workspace for film, television, documentary, stage, commercials and creator video.**

SWDR takes a project from first draft to the shoot in one place. You write in an industry-formatted script editor, shape the story on beat boards and series maps, then break the script down, schedule it, budget it and issue call sheets. Every production document links back to the exact line of the script it came from.

It works offline in the browser, keeps your projects on your device by default, and adds accounts and private team workspaces when you want to collaborate.

---

## Features

### Writing
- **Script editor**: one continuous document with Final Draft–style Enter/Tab element flow, an element menu (`Ctrl+E`) and shortcuts (`Ctrl+Alt+1…9`).
- **Auto-format and SmartType**: `INT.`/`EXT.` becomes a scene heading, `(` a parenthetical, `TO:` a transition. Characters, locations, times of day and extensions autocomplete from the script itself.
- **True pagination**: page numbers, scene numbers, (MORE)/(CONT'D), a title page, Letter or A4, and print/PDF output that matches the screen line for line.
- **Revisions**: named drafts, stashes and issued scripts, revision colours and asterisks, locked pages, side-by-side draft comparison and restore.
- **Dialogue tools**: dual dialogue, alternate lines you can cycle in place, bold/italic/underline.
- **Comments** anchored to text that follow edits, with resolve and reopen.
- **Focus mode**, find and replace, scene navigator, zoom, page and word count.
- **Two-column AV scripts** with timing for documentary and commercial work.

### Script tools
- **Report**: pages, estimated screen time, dialogue share per character, scenes and first appearance, locations, INT/EXT and day/night split, longest scenes, with CSV export.
- **Checks**: a formatting checker for headings without INT./EXT. or a time, cues without dialogue, stray parentheticals, transitions, duplicate scene numbers, overlong action and likely misspelt names. Each issue jumps to its line.
- **Table read**: the script read aloud with a different voice for each character and a narrator for action, starting from any scene.
- **Goals**: a daily word goal with progress in the toolbar, a streak and a 14-day chart.

### Creator studio: social short-form and YouTube long-form
- **Content board and calendar**: every video moves from Idea → Scripting → Filming → Editing → Scheduled → Published by drag and drop, with a month calendar of publish dates.
- **Short-form** for TikTok, Instagram Reels, YouTube Shorts and LinkedIn, built on **Hook → Cut → Convert**. **YouTube long-form** runs cold open, intro, chapters, sponsor, recap and end screen.
- **Live previews while you write**: a 9:16 phone with burned-in captions, the platform's buttons and **safe zones**; and for YouTube, the feed card (thumbnail, title, duration) and the watch page with a chaptered scrubber. Press play to watch the script run in real time; the current beat lights up in the script.
- **Packaging first**: A/B/C title options previewed in the feed, title formulas, thumbnail text and a **hook library** of proven openings.
- **Retention and platform checks**: hook timing, visual coverage (flags long stretches with no B-roll or on-screen text), target and maximum length for every cross-posted platform, title and caption limits, YouTube chapter rules and the hashtag limit.
- **Publishing pack**: description or caption with auto-generated YouTube chapters and hashtags, **.srt captions** timed from the script, cross-posting, and a full export.
- **Repurpose**: cut a short from any YouTube chapter in one click. Plus a mirrored, pace-matched **teleprompter** and **Send to AV script**.

### Story development
- **Outline and beat board** by act, with beats linked to scenes.
- **Series planning**: seasons and episodes, a 24-episode story map, relationship web, character dossiers, arcs and continuity checks.
- **Storyboards and shot lists** per scene.

### Documentary and factual
- **Editorial workspace**: research, sources, claim verification, segments, host briefs and rundowns, all derived from one frozen version of the segment data.

### Production
- **Breakdown** built from the script: cast, locations and page counts in eighths, colour-coded categories and a catalogue.
- **Cast & crew** and **Locations** directories with photos, contacts, recce images and scene stats.
- **Stripboard**: INT/EXT × DAY/NIGHT strips, drag-and-drop and keyboard scheduling, day breaks and company moves, plus a calendar view.
- **Call sheets**: issue, acknowledge and reissue, with cast listed by name, weather, hospital, parking and CSV export.
- **Sides, day out of days and production reports.**
- **Budget top sheet**: account codes, cost lines (quantity × rate × units), fringes (UK NI, holiday pay, pension or custom), contingency, spend bars, over-budget flags and CSV export.
- **Script change tracking**: production flags scenes whose script changed since the issued draft and lets you review them before relinking.

### Accounts and collaboration
- **Sign up and sign in** with email and password, from **Sign in** in the top bar.
- **Private team workspaces**: share a project, invite people by link, and assign a role (Owner, Writer, Reviewer, Viewer) for the whole project or selected episodes.
- **Review links**: expiring, read-only links to an issued script.
- **Sync** with line-level merging, conflict detection, suggestions and line history.

### Import and export
- **In:** Final Draft (`.fdx`), Fountain, Word (`.docx`), text-based PDF.
- **Out:** FDX, Fountain, DOCX, PDF and a full `.swdr` project archive.

---

## How it works

**Local-first.** Projects live in your browser's IndexedDB, with a recovery journal for unsaved edits, so writing works with no connection. The app installs as an offline-capable web app. Use **Export archive** to back up a project or move it to another device.

**Accounts are optional.** Signing in creates a hosted account. Choosing **Create private copy** sends a project to your team workspace, where invited members edit it together. Nothing leaves your device until you do that.

**One source of truth.** The breakdown, schedule, call sheets, budget and story tools all read the same issued script revision. Every production item keeps a link to its scene and line, so a script change shows exactly what it affects.

**Security.** Passwords are hashed with scrypt. Sessions are random tokens kept in `HttpOnly`, `Secure`, `SameSite=Strict` cookies and stored only as digests. Invitation links are single-use and expire. Sign-in attempts are rate-limited, and every request must come from the app's own origin.

---

## Getting started

Requires **Node.js 22** or later.

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
```

Choose **Load demo projects** on Home to explore a TV series, a documentary, a commercial and a creator channel.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the production app into `dist/` |
| `npm run typecheck` | Type-check the project |
| `npm run lint` | Lint the project |
| `npm test` | Run the unit tests |
| `npm run test:browser` | Run the browser tests (Playwright) |

---

## Deploying with accounts

SWDR deploys to **Vercel** as a static app plus one serverless route, `/api/team`, which serves accounts and team workspaces.

1. Import the repository into Vercel. The framework is Vite and the output folder is `dist`.
2. Connect a **Postgres** database, such as **Neon** from the Vercel Marketplace. SWDR uses the connection the integration provides (`DATABASE_URL` or `POSTGRES_URL`). You can also set `SWDR_TEAM_DATABASE_URL` yourself.
3. Choose who can sign up with `SWDR_TEAM_SIGNUP`:
   - `open`: anyone with the link can create an account. Each person sees only the projects they own or are invited to.
   - `invite` (the default): accounts only through an invitation link.
4. Deploy. The database tables are created automatically on first use and upgraded in place on later releases.

With invite-only sign-up, create the first owner's invitation from a checkout with the database URL in your shell:

```bash
node --import tsx server/team-admin.ts invite you@example.com --origin https://your-app.vercel.app
```

The full account, role and security reference is in [docs/workspace.md](docs/workspace.md).

---

## Project structure

```
src/
  writing/       Script editor, pagination, outline, AV scripts, script tools
  story/         Series map, relationships, dossiers, editorial workspace
  production/    Breakdown, stripboard, call sheets, sides, reports, budget
  creator/       Creator studio: short-form and YouTube planning, checks, publishing
  interchange/   FDX, Fountain, DOCX and PDF import and export
  workspace/     Local storage, accounts, team sync and sharing
  shell/         App frame, navigation, command palette, shortcuts
api/team.ts      Serverless route for accounts and team workspaces
server/          Account, invitation and sync services, database schema
tests/           Unit and browser tests
docs/            Feature guides
```

**Built with** React 19, TypeScript, Vite, ProseMirror, the Astryx design system and PostgreSQL.

## Documentation

- [Feature map](docs/feature-map.md): every capability and its status
- [Production](docs/production.md): breakdown, scheduling, call sheets and budget
- [Story](docs/story.md): series planning and editorial tools
- [Interchange](docs/interchange.md): import and export formats
- [Workspace](docs/workspace.md): local storage, accounts and teams

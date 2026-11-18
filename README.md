# SWDR

SWDR is a private writing and production workspace for film, television, stage, documentaries and commercials. Home opens the project library. A project opens the manuscript, outline, story bible, editorial workspace or production tools.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open [SWDR on localhost](http://127.0.0.1:5173). Select **Load demo projects** in an empty workspace to open a fictional television series, factual series and commercial. The television demo has two seasons and 24 episodes. Night Signal includes 60-second and 20-minute AV documents.

Device work lives in IndexedDB for this browser profile and origin. The status changes to **Saved on this device** after the local transaction commits. Run a production build with `npm run build` and serve `dist` over HTTPS or localhost to enable the offline application shell. Finish an initial online visit before opening the installed shell offline.

## Writing keys

| Key | Action |
| --- | --- |
| Enter | Next element: Scene heading → Action, Character → Dialogue, Dialogue → Action, Transition → Scene heading. On an empty line: Action → Scene heading, Character or Dialogue → Action. |
| Tab / Shift+Tab | Action → Character, Character → Transition, Dialogue → Parenthetical, Parenthetical → Dialogue; Shift+Tab steps back |
| Ctrl+Alt+1–9 (⌘⌥ on Mac) | Scene heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, Note, Act |
| Ctrl+E | Element menu |
| Ctrl+F | Find and replace |
| Ctrl+Shift+F | Focus mode |
| Ctrl+Z / Ctrl+Shift+Z | Undo and redo. Paste, cut and drop are separate steps. |
| Ctrl+B / I / U | Bold, italic, underline |
| Ctrl+Alt+M | Comment on the selected words |
| Ctrl+Alt+↑ / ↓ | Cycle a line's alternate wording |

Typing `INT. ` or `EXT. ` starts a scene heading, `(` after a cue starts a parenthetical, and a line ending in `TO:` becomes a transition. SmartType suggests scene intros, locations and times already in the script, character names and extensions; press Enter or Tab to accept and Esc to dismiss.

## Backup and restore

1. Open a document and choose **Export** → **Project archive**.
2. Keep the downloaded `.swdr` with your project backups.
3. To verify a backup, open SWDR in a fresh browser profile. On Home, choose **Import script** and select the archive. Review the project title and contents, then restore it.
4. Open the restored project and check its issued drafts, attachments and source links. A writing snapshot can also be restored into the current draft as a separate head.

## Private Vercel deployment

Use a dedicated Vercel project connected to this repository. Use the Vite preset, Node.js 22 or newer, `npm ci` to install, `npm run build` to build and `dist` for the output directory. The repository maps `/team` to the editor shell and exposes the team API at `/api/team`.

Prepare a private Postgres database and apply [the team schema](server/team-schema.sql). Configure the server-side environment variables described in [Team workspace](docs/workspace.md). Use preview-specific credentials and a test database for verification. Protect the preview and production environments in [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection). Confirm the proper access plan before sharing review links because platform protection can require an additional sign-in.

Open `/team` and sign in with a configured account. An owner can create a private team copy from a project saved on the device, grant viewers and writers the intended episode scope, and issue expiring review links from an immutable script revision. Team sync has its own acknowledgement. Published review links carry only their issued document.

The Vercel deployment guide for this build is also covered in [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## Verify

```sh
npm run build
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:browser
# or reuse an installed Chromium
SWDR_CHROMIUM=/path/to/chrome npm run test:browser
```

See [verification and remaining gaps](docs/verification.md), [supported interchange](docs/interchange.md), and the [six-application REA research matrix](docs/research/rea/README.md).

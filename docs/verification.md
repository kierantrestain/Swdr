# Release verification

Results from the REA-led rebuild run on 18 November 2026: Linux x64, Node 22.23.5 and Chromium 153.0.8010.12. The project pins `@playwright/test` 1.60, whose bundled browser build is not on this host, so the suite ran with `SWDR_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.

| Check | Result |
| --- | --- |
| `npm run build`, `npm run typecheck`, `npm run lint` | Pass |
| `npm test` | 49 pass, 0 fail, 1 skipped (the PostgreSQL suite needs `SWDR_TEAM_TEST_DATABASE_URL`) |
| `npm run test:browser` | **23 of 23 pass** against the production bundle |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Browser journeys

| Journey | Evidence |
| --- | --- |
| Write | New screenplay written with the keyboard. INT./EXT. auto-format, Tab/Shift+Tab/Enter element flow and SmartType (scene intros, saved locations, cues and extensions). Five elements selected across blocks, copied and pasted with their types and unique IDs. Undo and redo, find and replace across the manuscript, Focus mode and drawers keep the selection, the scene list moves the caret. Save and reopen, plus recovery of an interrupted offline write. |
| Long manuscript | A 175-page Fountain import. Typing latency p95 was **30.1–36.2 ms** across two runs, from the trusted input event to the second animation-frame callback (target under 50 ms). The whole document stays live in the editor. |
| Pagination | Sheets measure exactly 1,084 px apart (a 1,056 px Letter page plus a 28 px gap) on a five-page script with two split speeches. (MORE)/(CONT'D) and page numbers render at the layout engine's line positions. |
| Series and factual | A 24-episode story map. A cell, dossier link and claim card each open their exact script passage read-only. Spoiler-scoped export, an arc timeline, continuity checks labelled as generated, and the claim board. |
| Production | Strips scheduled by keyboard, menu and drag and drop, with the call sheet following. Script changes after release are flagged on strips and the breakdown. Cast clash, costs, call sheet issue and reissue, and reimport of a moved and omitted shooting draft. |
| Save, share and recover | Archive restore in a clean profile with its exact issued line. The service-worker shell reopens a saved screenplay offline. |

## Deployment

The preview deployment `swdr-9lav5h53j-kierantrestain-9646s-projects.vercel.app` (`dpl_CcZ9p7nCDaXSzGGXBbyREnvHh21y`) was created with Vercel CLI 66.0.0 and reported **READY**. The build ran `npm ci` and `npm run build` on Node 26.x, and the `api/team` function was packaged with `server/team-model.js`, `server/team-service.js` and `src/model.js`. Running `vercel build` locally produced the same function, which was then loaded and invoked as the runtime does. It answers `503 Private team access is not configured.` instead of failing to import.

Vercel Deployment Protection covers every preview, so the URL needs a Vercel sign-in. The project has no environment variables. The hosted team workspace stays unavailable until `SWDR_TEAM_DATABASE_URL` and `SWDR_TEAM_ACCOUNTS` are set and the [schema](../server/team-schema.sql) is applied ([team guide](workspace.md)). Local writing, series, factual and production work do not depend on it.

## Defects fixed in this run

- **Team API on Vercel** failed with `ERR_MODULE_NOT_FOUND: /var/task/server/team-model`. Runtime relative imports in `api/` and `server/` now include their `.js` extension. `tests/api-esm.test.ts` compiles the handler one file at a time, as Vercel does, and loads it as native ESM.
- **Offline shell** cached every asset but missed them on reload. Module scripts and the stylesheet are requested with `crossorigin`, and the server sends `Vary: Origin`. The worker now matches hashed assets with `ignoreVary`. The test reproduced the failure on the previous build.
- **Archive import**: `fflate` 0.7.5 fixes an infinite loop on malformed ZIP64 input (GHSA-px8p-9vwx-vf98).

## Screenshots

| Workspace | Capture |
| --- | --- |
| Home | [Home](screenshots/final-01-home.png) |
| Manuscript | [Write](screenshots/final-02-write.png) · [Phone](screenshots/final-09-write-phone.png) · [Focus](screenshots/final-07-focus.png) · [Page break with (MORE)/(CONT'D)](screenshots/final-08-page-break-more-contd.png) |
| Writing tools | [SmartType extensions](screenshots/final-03-smarttype.png) · [SmartType locations](screenshots/final-04-smarttype-locations.png) · [Find and replace](screenshots/final-05-find-replace.png) · [Scene navigator](screenshots/final-06-scene-navigator.png) |
| Series intelligence | [Story map](screenshots/story-map.png) · [Relationship web](screenshots/story-relationship-web.png) · [Arcs and continuity](screenshots/story-arcs-continuity.png) · [Character dossier](screenshots/08-character-dossier-1440x900.png) |
| Factual | [Claim board](screenshots/story-claims.png) · [Editorial](screenshots/09-editorial-1440x900.png) · [AV](screenshots/05-av-1440x900.png) |
| Production | [Stripboard](screenshots/production-stripboard-1440x900.png) · [Script changes](screenshots/production-script-changes-1440x900.png) · [Breakdown](screenshots/production-breakdown-1440x900.png) · [Call sheet](screenshots/production-call-sheet-1440x900.png) |
| Other | [Import](screenshots/04-import-1440x900.png) · [Outline](screenshots/06-outline-1440x900.png) |

The REA evidence matrix for the six reference products is in [research/rea](research/rea/README.md).

## Remaining coverage

- Production team activation requires private database and account configuration. The [team guide](workspace.md) includes the schema and live test command.
- Genuine `.celtx`, `.cxscript`, `.wdz`, `.sbx`, `.fadein` and `.osf` exports still require permitted samples. The [.odraft mapping](interchange.md) was tested with a source-conforming example. The [interchange guide](interchange.md) details PDF extraction, OCR handoff, Unicode and style fidelity.
- [Pinned OpenDraft coverage](research/opendraft-runtime.md) includes boot and writing. AV, relationship tools, history, offline, co-writing and genuine exports remain unverified in the pinned app.
- Real-time co-writing in the browser editor is not wired to the team service in this run. Team sync stays on its separately acknowledged path.
- SWDR ships an installable web app. Native desktop packaging, third-party integrations and live call-sheet delivery are outside the verified build. The browser table read needs an on-device speech voice.

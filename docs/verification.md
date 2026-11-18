# Release verification

A clean checkout passed `npm ci`, production build, TypeScript and ESLint. The default test run passed 35 checks. The separately configured PostgreSQL suite ran against PostgreSQL 18.6 and the real loopback HTTP handler in an isolated Vercel Sandbox. That run passed 13 checks with five synthetic accounts, including edits by three concurrent writers.

## Browser results

All 15 Playwright journeys passed on Chromium 148.0.7778.96. The suite opened the production bundle and exercised the actual application state and IndexedDB. The restricted runner served the compiled assets through browser routing. The service-worker test enabled real browser caching, interrupted network access and reloaded a saved screenplay from the installed shell.

| Journey | Evidence |
| --- | --- |
| Write and migrate | Keyboard screenplay transitions, persistent reopen, Focus caret and scroll, Word cue correction, scan detection and batch cancel/retry. Letter, A4 and a locked Blue revision passed deterministic PDF goldens. FDX, Fountain, DOCX and text PDF field checks ran separately. |
| Plan and write | Two seasons and 24 episodes. Browser proof covered spoiler-scoped export, a dossier interaction to its retained script line and a beat that created a linked scene. Domain checks covered flashbacks and a recorded continuity exception. |
| AV and factual | A 60-second cut, a 20-minute rehearsal and 24 fictional factual outlines. Corrected a shared claim, kept the original issue accessible and downloaded four revised outputs from the same issue. |
| Production | Reviewed a moved and omitted shooting draft, retained the reviewed shot link, resolved a cast conflict, checked day-out-of-days and £515 planned versus £465 actual, then issued, acknowledged and reissued a test call sheet. |
| Save, share and recover | Restored an archive in a clean browser profile with its exact original source bytes and issued-line link. Verified interrupted local write recovery, private episode projection, conflicting edits, retries, line restore, link expiry and access revocation. |

## Typing latency

**33.4 ms p95** on a **175-page** Fountain screenplay imported through the UI. The run recorded 64 trusted keystrokes at 1440 × 900 on Apple M2, 8 GiB RAM, macOS 26.2 and Node 22.22.2. The interval runs from the input event to the second animation-frame callback, a completed-frame proxy. The target was under 50 ms.

## Screenshots

Actual captures from the seeded app.

| Workspace | Capture |
| --- | --- |
| Home | [1440 × 900](screenshots/01-home-1440x900.png) |
| Manuscript | [1440 × 900](screenshots/02-write-1440x900.png) · [768 × 1024](screenshots/02-write-768x1024.png) · [390 × 844](screenshots/02-write-390x844.png) |
| Focus | [1440 × 900](screenshots/03-focus-1440x900.png) |
| Import | [1440 × 900](screenshots/04-import-1440x900.png) |
| AV | [1440 × 900](screenshots/05-av-1440x900.png) |
| Outline | [1440 × 900](screenshots/06-outline-1440x900.png) |
| Series Intelligence | [1440 × 900](screenshots/07-series-intelligence-1440x900.png) |
| Character dossier | [1440 × 900](screenshots/08-character-dossier-1440x900.png) |
| Editorial | [1440 × 900](screenshots/09-editorial-1440x900.png) |
| Stripboard | [1440 × 900](screenshots/10-stripboard-1440x900.png) |

## Remaining coverage

- Production team activation requires private database and account configuration. The [team guide](workspace.md) includes the schema and live test command.
- Genuine `.celtx`, `.cxscript`, `.wdz`, `.sbx`, `.fadein` and `.osf` exports still require permitted samples. The [.odraft mapping](interchange.md) was tested with a source-conforming example. The [interchange guide](interchange.md) details PDF extraction, OCR handoff, Unicode and style fidelity.
- [Pinned OpenDraft coverage](research/opendraft-runtime.md) includes boot and writing. AV, relationship tools, history, offline, co-writing and genuine exports remain unverified in the pinned app.
- SWDR ships an installable web app. Native desktop packaging, third-party integrations and live call-sheet delivery are outside the verified build. The browser table read needs an on-device speech voice.

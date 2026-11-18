# SWDR feature map

This map compares SWDR with the six reference products, capability by capability. **Source** says how the reference behaviour is known:

- **Runtime** — observed in the running app.
- **Bundle** — read in the code each app ships before sign-in.
- **Owner** — the authenticated Celtx screen the product owner shared on 18 November 2026.
- **Docs** — public help pages.

Status: ✅ shipped and tested · 🟡 partial · ⏳ in progress this round · ⬜ not built.

## 1. Writing

| Capability | Reference (source) | SWDR |
| --- | --- | --- |
| One continuous document, selection across elements, multi-paragraph paste | OpenDraft (Runtime), WriterDuet/FD Cloud editors (Bundle) | ✅ ProseMirror document editor |
| Enter/Tab element flow | FD Cloud `returnTo`/`tabTo`, Celtx `enter`/`blankEnter`/`tab`, WriterDuet table (Bundle) | ✅ Final Draft tables plus Celtx's empty-line flow |
| Element menu listing every shortcut, "Tab to switch" | Celtx (Owner) | ✅ Astryx menu with key hints, Ctrl+Alt/⌘⌥ 1–9, Ctrl+E |
| Auto-format for INT./EXT., "(", "TO:" | WriterDuet (Bundle) | ✅ |
| SmartType: scene intros, locations, times, characters, extensions | FD Cloud provider chain (Bundle) | ✅ |
| Pagination with (MORE)/(CONT'D), scene numbers, page numbers | All (Bundle/Runtime) | ✅ Matches the print layout line for line |
| Title page as the first sheet | Celtx (Owner) | ✅ |
| Page and word count, zoom | Celtx (Owner) | ✅ |
| Find and replace, focus mode, scene navigator, undo/redo | All | ✅ |
| Comments anchored to text | WriterDuet, FD Cloud ScriptNotes (Bundle) | ✅ Highlight, panel, resolve/reopen, follow edits |
| Revision colours, asterisks, locked pages, issued drafts | FD, WriterDuet, OpenDraft (Bundle/source) | ✅ |
| Alternate dialogue | WriterDuet, FD (Bundle) | ✅ Margin marker; Ctrl/⌘+Alt+↑/↓ cycles alternates in place |
| Dual dialogue | All | ✅ |
| Bold, italic, underline | Celtx (Owner) | ✅ Ctrl/⌘+B/I/U and toolbar; kept in FDX runs, Fountain emphasis, print and PDF faces |
| Real-time co-writing in the editor (live cursors) | WriterDuet Firebase/Firepad (Bundle), OpenDraft Yjs (source) | ✅ Presence avatars, typing state, named remote cursors, follow; character-level three-way merge within a line; ~0.8 s adaptive sync |
| Read-through with voices | Celtx "Read Through" (Owner) | ✅ Script tools → Table read: a device voice per character, narrator for headings and action, start from any scene, speed, choose what is read aloud |
| Script reports and statistics | Final Draft reports, WriterDuet stats (Bundle) | ✅ Script tools → Report: pages, screen time, dialogue share per character, scenes, first appearance, locations, INT/EXT and time-of-day split, longest scenes, CSV |
| Formatting checker | WriterDuet (Bundle) | ✅ Script tools → Checks: headings without INT./EXT. or time, cues without dialogue, orphan dialogue and parentheticals, transitions, duplicate scene numbers, long action, likely misspelt names; each jumps to the line |
| Writing goals and streaks | WriterDuet goals/schedule (Bundle), Arc Studio | ✅ Script tools → Goals: daily word goal, toolbar progress, streak and a 14-day chart (per device) |

## 2. Story development

| Capability | Reference | SWDR |
| --- | --- | --- |
| Beat sheet, beat board, index cards | Celtx Beat Sheet (Owner), FD Beat Board (Bundle) | ✅ Outline beats by act, linked to scenes |
| Series → seasons → episodes, 24-episode story map | (SWDR original) | ✅ |
| Relationship web, dossiers, arcs, continuity checks | (SWDR original) | ✅ Generated checks are labelled as not canon |
| Storyboard | Celtx (Owner), StudioBinder (Docs) | ✅ Shots and storyboard frames per scene |

## 3. Factual and documentary

| Capability | Reference | SWDR |
| --- | --- | --- |
| Two-column AV scripts with timing | Celtx AV format (Bundle), OpenDraft AV (source) | ✅ |
| Research, sources, claim verification, host briefs, rundowns | (SWDR original) | ✅ Claim board, sources, segments, issued outputs |

## 3b. Creator video

| Capability | Reference | SWDR |
| --- | --- | --- |
| Short-form scripts for TikTok, Reels, Shorts, LinkedIn | (SWDR original) | ✅ Hook → Cut → Convert beats with spoken, on-screen and B-roll lines; timing from speaking pace |
| YouTube long-form with chapters | (SWDR original) | ✅ Cold open, intro, chapters, sponsor, recap, end screen; chapters generated for the description |
| Platform checks | (SWDR original) | ✅ Hook timing, target and maximum length, title and caption limits, chapter rules, hashtag limit |
| Publishing pack, repurposing, teleprompter | (SWDR original) | ✅ Copy or export; cut a short from a chapter; paced full-screen teleprompter; send to AV script |

## 4. Production

| Capability | Reference | SWDR |
| --- | --- | --- |
| Script breakdown with colour-coded categories | Celtx (Bundle: about 45 categories), StudioBinder (Docs) | ✅ |
| Catalog of breakdown items | Celtx "Catalog" (Owner) | ✅ Catalogue in the production model |
| Stripboard with drag scheduling, day breaks, boneyard | StudioBinder (Docs) | ✅ |
| Shooting schedule and calendar | Celtx "Schedule" (Owner) | ✅ Calendar view |
| Call sheets | Celtx print types (Bundle), StudioBinder (Docs) | ✅ Issue, acknowledge, reissue, CSV |
| Day out of days, sides, shot lists | Celtx print types (Bundle) | ✅ |
| Budget | Celtx "Budget" (Owner), StudioBinder (Docs) | ✅ Top sheet with account codes, contingency, fringes (UK NI, holiday pay, pension presets), spend bars, over-budget flags, one-dialog cost entry, CSV |
| Cast & Crew directory | Celtx (Owner), StudioBinder (Docs) | ✅ Breakdown → Cast & crew, with photos and cast IDs; call sheets list cast by name |
| Files & Media | Celtx (Owner) | ✅ Media library with usage, storage size, filters, upload, download and safe deletion |
| Project dashboard and next steps | (SWDR original) | ✅ Project pulse on the Overview with a ranked Next up list |
| Search across every script line | (SWDR original) | ✅ Command palette searches all script text in the project |
| Pitch one-sheet | (SWDR original) | ✅ Generated from the script; print, PDF or text |
| Script revision impact on schedule | StudioBinder (Docs) | ✅ Script-change flags and review |

## 5. Projects, navigation and accounts

| Capability | Reference | SWDR |
| --- | --- | --- |
| Project sidebar with sections | Celtx (Owner) | ✅ Write / Develop / Production / Project groups by project type; collapses to an icon rail in Write (Ctrl/⌘+\\) |
| Episode switcher that drives every section | (Owner request) | ✅ Trail menu, ‹ › and `[` `]`; keeps the current section and tab |
| Back/breadcrumbs everywhere; command palette; shortcuts help | (Owner request) | ✅ Back and trail on every shell page, Ctrl/⌘+K palette, `?` shortcuts dialog, `g`+letter jumps |
| Sign-up, sign-in, invitations, members, roles | Celtx/WriterDuet/Arc/StudioBinder (Runtime: login and sign-up screens) | ✅ Email/password accounts, invite links with role and episode scope, members table. Needs a configured Postgres database. |
| Share for review (read-only links) | WriterDuet view-only (Docs) | ✅ Expiring review links from issued revisions |
| Offline writing and recovery | WriterDuet localforage, FD Cloud IndexedDB journal (Bundle) | ✅ IndexedDB plus journal; installable offline shell |

## 6. Interchange

| Format | SWDR |
| --- | --- |
| FDX, Fountain, DOCX, text PDF in; FDX, Fountain, DOCX, PDF out | ✅ Field checks in `tests/interchange.test.ts` |
| `.swdr` project archive | ✅ |
| `.celtx`, `.fadein`, `.osf`, `.highland`, `.wdz` | ✅ Bundle reader: Celtx script HTML, Open Screenplay Format, Fountain or FDX inside the archive. Verify with real exports from each app before relying on edge cases. |

## Ranked next steps

1. ~~Real-time co-writing~~ shipped. Next: a WebSocket transport for keystroke-level latency at larger team sizes.
2. ~~Inline styles~~ shipped in this round.
3. ~~Cast & Crew directory~~ and ~~Files & Media~~ shipped.
4. ~~Budget account codes and fringes~~ shipped in this round.
5. ~~Alternate-dialogue cycling~~ shipped in this round.
6. ~~Per-character voices~~, reports, formatting checks and writing goals shipped in this round.

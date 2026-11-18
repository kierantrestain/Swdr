# SWDR feature map

This map compares SWDR with the six reference products, capability by capability. **Source** says how the reference behaviour is known:

- **Runtime** — REA drove the running app.
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
| Real-time co-writing in the editor (live cursors) | WriterDuet Firebase/Firepad (Bundle), OpenDraft Yjs (source) | ⬜ Team sync is document-level. Next step: Yjs over the team service. |
| Read-through with voices | Celtx "Read Through" (Owner) | 🟡 Browser speech in Script tools; per-character voices not assigned |

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

## 4. Production

| Capability | Reference | SWDR |
| --- | --- | --- |
| Script breakdown with colour-coded categories | Celtx (Bundle: about 45 categories), StudioBinder (Docs) | ✅ |
| Catalog of breakdown items | Celtx "Catalog" (Owner) | ✅ Catalogue in the production model |
| Stripboard with drag scheduling, day breaks, boneyard | StudioBinder (Docs) | ✅ |
| Shooting schedule and calendar | Celtx "Schedule" (Owner) | ✅ Calendar view |
| Call sheets | Celtx print types (Bundle), StudioBinder (Docs) | ✅ Issue, acknowledge, reissue, CSV |
| Day out of days, sides, shot lists | Celtx print types (Bundle) | ✅ |
| Budget | Celtx "Budget" (Owner) | 🟡 Budget lines with planned vs actual; no account-code templates |
| Cast & Crew directory | Celtx (Owner), StudioBinder (Docs) | 🟡 People live in production data, call sheets and cast IDs; no standalone directory page yet |
| Files & Media | Celtx (Owner) | 🟡 Project assets and imports; no media browser yet |
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
| `.celtx`, `.wdz`, `.fadein` | ⬜ Needs genuine sample files; see [interchange](interchange.md) |

## Ranked next steps

1. **Real-time co-writing in the editor** (Yjs on the team service). This is the largest gap against WriterDuet.
2. ~~Inline styles~~ shipped in this round.
3. **Cast & Crew directory and Files & Media browser** as first-class sections.
4. **Budget templates** (account codes, fringes) and exports.
5. ~~Alternate-dialogue cycling~~ shipped in this round.
6. **Per-character voices** for the read-through.

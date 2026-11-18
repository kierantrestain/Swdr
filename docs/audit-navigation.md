# Navigation and function audit

Audited on 18 November 2026 against the production build (`npm run build && npx vite preview --port 4176`) with the
demo projects loaded: **The North Shore** (24-episode television series with Series Intelligence and a production plan
for S1E04), **The Evidence Room** (24-episode factual series) and **Night Signal** (commercial / AV). Every page and tab
was visited with Playwright at 1440×900, then again at 1024, 768 and 390 wide. Findings are recorded against the
state before the project shell (commit `887af97`), followed by what changed.

Status: **Fixed** in this change, **Partly fixed** (shell side done, remainder owned elsewhere), **Open** (outside the
shell and design ownership; see the last section).

## Findings

| Page | Problem | Fix | Status |
|---|---|---|---|
| Every project page | No persistent project navigation: moving between Write, Outline, Series Intelligence, Editorial and Production meant returning to the project overview cards each time. | Project shell (`src/shell/Shell.tsx`) with an Astryx `AppShell` + `SideNav`: Write (Script, Outline), Develop (Series Intelligence or Editorial), Production (Schedule, Breakdown, Shots & storyboard, Sides, Call sheets, Reports, Budget) and Project (Overview, Import & files, Team & sharing). Sections are shown only for the project types they apply to. Items are real links (`#p/…`), so they open in a new tab too. | Fixed |
| Every page | The only way back was the Home button or the project name; there was no Back and no trail showing where you are. | Top bar with Home and Back (Back returns through in-app history, or to the parent page when the page was opened directly) and Astryx `Breadcrumbs`: Projects › Project › Section › Episode. | Fixed |
| Write | The large app chrome competed with the manuscript. | The sidebar collapses to an icon rail inside Write and AV (remembered separately from other pages, toggled with Ctrl/⌘+\\); Focus mode hides the shell entirely while keeping the editor mounted, so the caret survives. | Fixed |
| Write, Production, Series Intelligence | No way to change episode without going back to the overview list. | Global episode switcher in the trail (menu of every episode grouped by season, previous/next buttons, `[` `]` and Alt+PageUp/PageDown). Switching keeps the section and tab and swaps the document in the address. | Fixed |
| Production | Header showed `S01E04` while the rest of the app shows `S1E04`; no episode title. | Subtitle now reads `S1E04 · Doubt · Shooting Draft 1` in the shared format. | Fixed |
| Production | The active pane (Breakdown, Call sheets…) was component state, so it was lost on reload, could not be shared, and was reset by any episode change. | Pane is in the address (`?tab=breakdown`, `call-sheets`, `budget`…) and survives episode switching; sidebar items link straight to each pane. | Fixed |
| Series Intelligence | The view was keyed to the project, so opening another episode's document kept the old "As of" episode and filters; the information did not follow the episode. | The view is keyed to the open document: "As of" and the season default to the episode in the trail, and change with the episode switcher. The workspace tab (Story map, Event ledger…) is kept in the address. | Fixed |
| Editorial | "Editorial document" select changed the page but not the address or top bar, so the trail kept naming the previous episode, Back skipped it and the link could not be shared. Claim cards that open a segment in another episode had the same problem. | The selection now updates the address (replace), so the trail, sidebar and episode switcher follow it; an episode chosen in the shell resets the segment selection. Pane kept in `?tab=`. | Fixed |
| Outline | The Season/Episode selects changed a local state only: the trail still named the old episode and a reload returned to it. | Choosing an episode in the outline updates the address, so the trail, sidebar and Write all follow; the shell's switcher updates the outline. "Create episode script" opens the new document. | Fixed |
| Project overview | All five workspace cards were shown for every project type (Editorial for a fiction series, Series Intelligence for a commercial). | Cards and sidebar sections follow the project type; a "Current episode" strip shows format, scenes, beats and production status for the open episode; the current row is highlighted. | Fixed |
| Project overview | Documents list had no season filter; inline creation form pushed the page down. | Season segmented filter (All, S1, S2), document search, Astryx `Table` rows with scene/beat counts; New episode / New document open an Astryx `Dialog`. | Fixed |
| Home | No route to recent work beyond one card; no hint of shortcuts. | Continue panel with Resume and Open project, ⌘K hint, project library as an Astryx `Table` with format and last-edited columns, `SegmentedControl` filters, `EmptyState` with Load demo projects, Astryx `Dialog` for new projects. | Fixed |
| Import | Reached from a project, the page did not say which project it belonged to and listed none of the project's files. | Import & files sits in the project shell (trail: Project › Import & files); with a project open it lists the project's stored files with download links. | Fixed |
| All pages | No keyboard navigation other than inside the editor. | Command palette (Ctrl/⌘+K, Astryx `CommandPalette`) over sections, workspace tabs, episodes, scenes in the open script, other projects and actions; `g` then a letter for every section; `?` opens a Keyboard shortcuts dialog listing the navigation keys and the screenplay element keys (Ctrl/⌘+Alt+1–9, Tab/Shift+Tab, Enter, Ctrl+E, Ctrl+F, Ctrl+Shift+F). | Fixed |
| All pages at 768 and 390 | The top bar crammed the project name and context into one line. | Below 1024 px the sidebar moves into the Astryx mobile drawer, the top bar keeps Home, Back, Search and Share, and the trail with the episode switcher sits in a scrollable context bar. No horizontal page scroll at 1440, 1024, 768 or 390. | Fixed |
| Production (dark appearance) | Stripboard, banners and tabs used fixed light colours. | Legacy colour variables are aliases of SWDR theme tokens; strips keep printed-paper inks; banners use token mixes. | Fixed |
| Write (dark appearance) | The editor toolbar uses fixed light colours in `writing.css`. | The manuscript stage keeps the light appearance inside a dark shell (nested Astryx `Theme`). | Partly fixed |
| Team (`#team`) | Own top bar with Home only; no trail or Back; workspace switcher inside is local state. | Global shortcuts and palette work on the page. | Open — `src/workspace/team-ui.tsx` |
| Review link (`#review=…`) | No page heading (`h1`) and only a Home button. | Global shortcuts and palette work on the page. | Open — `src/workspace/team-ui.tsx` |
| Write | No visible page heading (`h1`) for assistive technology. | — | Open — `src/writing/editor.tsx` |
| Write / AV | Editor toolbar duplicates "Write"/"Outline" switching now provided by the shell. | — | Open — `src/writing/editor.tsx`, `src/writing/av.tsx` toolbar |

## Controls checked

A Playwright sweep opened each production pane (schedule, breakdown, shots, sides, call sheets, reports, budget), each
Series Intelligence tab, each Editorial tab, the outline and the project overview by URL, then clicked every visible,
non-destructive button in the page content once from a fresh load (423 button instances; destructive or file actions
such as delete, issue, export, download and choose files were left to the browser suite, which exercises them). Every
clicked button changed the page, opened a dialog or menu, or moved focus, and no page raised a script error. The
destructive and output actions are covered by `tests/production*.spec.ts`, `tests/story*.spec.ts`,
`tests/migration.spec.ts` and `tests/av.spec.ts`.

## Owners for the open items

* `src/workspace/team-ui.tsx` (accounts/team agent): render inside the project shell or adopt `Breadcrumbs` + Back;
  give the review page an `h1`; put the team workspace mode in the address.
* `src/writing/editor.tsx` and `src/writing/writing.css` (lead): drop the toolbar's Write/Outline pair now that the
  shell sidebar carries them, add a visually hidden `h1` (document title), and map the `--swdr-w-*` toolbar colours to
  Astryx tokens so the stage can follow the dark appearance.

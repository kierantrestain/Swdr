# Six-application REA research matrix

REA run of 18 November 2026. Every finding below is tagged with its source. **Direct** means REA observed the running application, drove it, or read its shipped code. **Secondary** means public documentation. Anything not observed is listed under *Not verified*. The evidence IDs refer to bundles in [`captures/`](captures/index.tsv).

## REA setup and how it was operated

| Item | Result |
| --- | --- |
| Package | `rea-agents@6.9.0`, the latest published version, pinned with `npm install -g rea-agents@6.9.0` (Node 22.23.5 meets REA's `^22.23.4` engine). The official repository was cloned for its guides. |
| Claude Code setup | `rea setup --client claude_code --yes` added the `rea` MCP server to `/root/.claude.json` (with a backup) and installed the `reverse-engineer-anything` skill. After the session restarted, the MCP tools loaded (`mcp__rea__*`). |
| `rea doctor` | Node and host are healthy. Hopper, Ghidra, IDA, JADX and Kuna are not installed; none is needed for web or JavaScript targets. |
| Browser launch | Chromium cannot use its sandbox when running as root in a container, so REA's documented `REA_BROWSER_NO_SANDBOX=true` setting was used. |
| Network | Chromium launched by REA does not use the session's HTTPS proxy, so REA's **connect mode** was used: an operator-started Chromium with the proxy and a loopback CDP port. The environment's allowlist was extended to each product's app and asset hosts. |
| Tools used | `capture_browser_scenario` (declared clicks, typing and keys), `capture_web_screenshot`, `inspect_web_page` with script sources, `export_web_scripts`, `analyze_web_bundle`. The runner is [`run-scenario.py`](run-scenario.py). |

## Access achieved, by product

| Product | Real application reached | Editor reachable? | REA evidence |
| --- | --- | --- | --- |
| Celtx | Yes, `www.celtx.com/a/ux/logon` (the app's own login) | No. It needs an account (email and password, or Microsoft sign-in). | `ev_716d4b74…` screenshot and accessibility tree; bundle `ev_7ca281cf…` |
| Final Draft | Yes. REA found **Final Draft Cloud** (`cloud.finaldraft.com`) from the site's navigation. | No. Sign-in is required. The desktop app is macOS/Windows only; none is available here. | `ev_ab77e8a5…` (site), `ev_db3db4c8…` (Cloud sign-in); bundle `ev_e9ce71ca…` |
| WriterDuet | Yes, `www.writerduet.com/script/`. The whole editor bundle is served before sign-in. | No. It needs an account (email sign-in). | `ev_5c48f6e7…` (MCP screenshot); bundle `ev_e7c62ccd…` |
| Arc Studio | Yes, once `assets.arcstudiocdn.com` was allowed (before that, REA recorded "Arc Studio could not start"). | No. Sign-up requires an email address plus a bot-verification challenge. | `ev_e9eab7c8…` (blocked), `ev_172bcbb1…` (signup); bundle `ev_f060452c…` |
| StudioBinder | Yes, once `apps3.studiobinder.com` was allowed (before that, the page was blank). | No. It needs an account (email and password). | `ev_542474d1…` (blank), `ev_1b021d7f…` (login); bundle `ev_448376de…` |
| OpenDraft | Yes. Official MIT source `Proteus-Technologies-Private-Limited/OpenDraft` at tag `v2.13.0`, SHA `41fd8b9`, run locally. | **Yes, fully.** REA drove a 24-step writing scenario. | `ev_3f0add87…` (start), `ev_0ff7ffc9…` (writing scenario) |

No account was created, and no login, paywall or verification step was bypassed. Real editor screens for the five commercial products remain unverified until authorised test accounts are provided (see *Remaining access blockers*).

## Matrix: verified behaviour and what SWDR did with it

**Action key:** **Preserve** = SWDR already met the benchmark; **Improve** = existing feature upgraded; **New** = feature added.

| Product | Verified features | Evidence | SWDR action |
| --- | --- | --- | --- |
| **Final Draft** (Cloud bundle) | ProseMirror node specs with `returnTo`/`tabTo`. Enter: Scene→Action, Action→Action, Character→Dialogue, Paren→Dialogue, Dialogue→Action, Transition→Scene. Tab: Action→Character, Character→Transition, Dialogue→Paren. `Mod-1…9/0` in a fixed order. Chained SmartType providers (SceneIntros → Locations → TimesOfDay; Characters → Extensions on "("). Indents (character 3in, dialogue 2.5–6in, transition right-aligned). Locked pages and margin revision marks. | Direct, bundle `ev_e9ce71ca…` | **New:** ProseMirror document editor ([`src/writing/pm`](../../../src/writing/pm)). Element registry with FD's Enter/Tab tables and digit order. Chained SmartType. **Preserve:** locked pages and revision marks. |
| **Celtx** (bundle) | Separate `enter`, `blankEnter` and `tab` flow tables per format. Blank-line Enter: Action→Scene heading, Character→Action, Dialogue→Action. Autocomplete built from the document's own paragraphs. Print: 72pt top/bottom, 108pt left, (MORE)/(CONT'D), (CONTINUED). About 45 breakdown categories. Print types: callsheet, stripboard, shooting_schedule, shotlist, sides, dood, storyboard. | Direct, bundle `ev_7ca281cf…` | **New:** Celtx empty-line Enter flow; SmartType indexes the live script. **Improve:** breakdown categories (production agent). **Preserve:** sides, day out of days, call sheets. |
| **WriterDuet** (bundle) | Element table with `enter`/`tab`/`shift` per element. Auto-format toggles: "(" makes a parenthetical, INT./EXT. makes a scene heading, a line ending "TO:" makes a transition, a bare name makes a character. Extension list (V.O.), (O.S.), (O.C.). Revision colour order Blue → Pink → Yellow → Green → Goldenrod → Buff → Salmon → Cherry. Custom contenteditable editor (jQuery and rangy) with Firebase and Firepad; localforage for offline storage. Page 816×1056px; Courier Prime is the default font. | Direct, bundle `ev_e7c62ccd…` | **New:** live auto-format (INT./EXT., "(", TO:, known names); Shift+Tab column; self-hosted Courier Prime. **Preserve:** revision colour sequence; IndexedDB journal for offline recovery. |
| **Arc Studio** | App shell and sign-up flow only. Uses Inter and Tailwind, a guided onboarding ("Skip Step" / "Exit Guide"), and Apple and Google sign-in. | Direct, `ev_172bcbb1…`; bundle `ev_f060452c…` (3 scripts before sign-in) | **Improve:** calm visual system; Focus mode keeps the page centred and hides the app chrome. Plot board and beat behaviour is **not verified** (secondary evidence only). |
| **StudioBinder** | Login wall only. The app bundle lives on `apps3.studiobinder.com`. | Direct, `ev_1b021d7f…` | **New** (from secondary workflow evidence): strip stripboard with INT/EXT × DAY/NIGHT colours, drag-and-drop and keyboard scheduling, unscheduled column, day breaks and company moves, one cast ID set across views, script-change flags, fuller call sheets. Screenshots are in `docs/screenshots/production-*`. |
| **OpenDraft** (runtime and MIT source) | Running editor: Tab Action→Character, Enter Character→Dialogue; Enter on a blank line opens an element picker; Ctrl+1 sets Scene heading. Select-all, copy and paste duplicates five blocks **with their types**. Gap: typing `int. lighthouse - night` into a new script **stays Action**. Source: `DEFAULT_NEXT_TYPE` and template `nextOnTab` tables, a line-count paginator with (MORE)/(CONT'D), SmartType lists, and the standard revision palette with FDX colour codes. | Direct, `ev_0ff7ffc9…`; source at `41fd8b9` | **New:** the same document-model architecture, implemented independently (no OpenDraft code copied). Element picker on Ctrl+E. **Improved on OpenDraft:** scene headings are auto-detected. |

## SWDR and OpenDraft on the same declared REA workflow

Both apps were driven with the same steps: a new script; `int. lighthouse - night`; Enter; action; Tab; `mara`; Enter; dialogue; Enter on a blank line; a second heading; the element menu; then select-all, copy and paste.

| Step | OpenDraft v2.13.0 (`ev_0ff7ffc9…`) | SWDR (`ev_b8179841…`, 28/28 steps) |
| --- | --- | --- |
| First heading in a new script | Stays Action; navigator shows 0 scenes | Scene heading, numbered 1 in both margins |
| Tab and Enter cue flow | Action → Character → Dialogue | Same |
| Enter on a blank line | Element picker | Celtx flow (→ Scene heading); picker on Ctrl+E |
| Element shortcuts | Ctrl+1…8 | Ctrl+Alt+1…9, plus Ctrl/Cmd+digit where the browser allows it (browsers reserve Ctrl+digit for tab switching) |
| Multi-block paste | Types kept | Types kept, fresh unique block IDs, and its own undo step |
| Page errors | none | none |

## Owner-provided evidence: authenticated Celtx (18 November 2026)

The product owner shared a screenshot of their own logged-in Celtx project. It is the first authenticated Celtx editor screen in this research. It shows:

- **Element menu:** a "TAB to Switch" header, with Act ⌘0, Scene Heading ⌘1, Action ⌘2, Character ⌘3, Dialogue ⌘4, Parenthetical ⌘5, Transition ⌘6, Shot ⌘7, Text ⌘8.
- **Project sidebar:** Script, Beat Sheet, Storyboard, Catalog, Cast & Crew, Budget, Schedule, Files & Media.
- **Tools rail:** Beats, Breakdown, Shot List, Media, Read Through.
- **Toolbar and status:** bold/italic/underline, 75% zoom, a footer page and word count, and the title page as the first sheet.

SWDR actions from this screen:

- **New:** an element menu with key hints; the title-page sheet; the page and word count; zoom.
- **In progress:** a project sidebar with an episode switcher.
- **Planned:** inline text styles.

Note: Celtx lists ⌘+digit. Browsers reserve Ctrl/⌘+digit for switching tabs, so SWDR advertises Ctrl+Alt/⌘⌥+digit (reliable) and also binds ⌘/Ctrl+digit where the browser passes it through. The full capability comparison is in [the feature map](../../feature-map.md).

## Remaining access blockers

1. **Authenticated editors (Celtx, Final Draft Cloud, WriterDuet, Arc Studio, StudioBinder).** Each needs an account. Accounts were not created with the owner's identity, and verification challenges were not bypassed. The bundle findings come from code each product ships to every visitor before sign-in, so they are **direct evidence of implementation, not observed runtime behaviour**. To close this gap, provide test accounts. The same REA scenarios ([`captures/swdr-writing/steps.md`](captures/swdr-writing/steps.md) shows the format) can then drive each editor.
2. **Final Draft desktop.** It is macOS/Windows only and needs a licence or trial download; nothing ran here.
3. **Arc Studio plot boards and StudioBinder's live stripboard.** These are not observed. SWDR's implementations follow the published workflows (secondary evidence).

Detailed bundle notes: [`bundle-findings.md`](bundle-findings.md). Exported third-party scripts were analysed in a scratch area and **are not stored in this repository**.

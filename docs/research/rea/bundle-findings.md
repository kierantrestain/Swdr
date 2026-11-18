# Bundle findings: WriterDuet, Celtx, Final Draft Cloud (pre-login JS)

Source: REA exports of shipped JS. These are static reads only. Nothing was executed. Evidence is given as file + short identifier. **[DIRECT]** = seen in code. **[INFERRED]** = our reasoning.

## WriterDuet (`script/main.bundle.js`, `legacy.bundle.js`, `legacy.firepad.js`)

- **Element model** [DIRECT] `main.bundle.js`, a line-type table `si`. Internal ids: `Slugline` (Scene), `Action`, `EditDialogName` (Character), `EditDialogParen`, `EditDialogContent` (Dialogue), `EditDialogLyric` (Lyrics), `Shot`, `Transition`, `Text` (General), `Note`, `Act`, `EndAct`. Each type has `fd_num` (FDX ordering 1–12), `fd_paginate_as` (Shot paginates as "Scene Heading", Lyrics as "Dialogue"), `dual` (dialogue-family types allow dual), and `caps`. Custom types carry `behaves_like`, `enter`, `tab`, `shiftEnter` (seen in sample `custom_line_types`: `Image`, `Outline`).
- **Enter/Tab table** [DIRECT] (`enter` / `tab` / `shift` fields):

| From | Enter | Tab | `shift` |
|---|---|---|---|
| Scene | Action | Action | Transition |
| Action | Action | Character | Scene |
| Character | Dialogue | Action | Parens |
| Parens | Dialogue | Character | Dialogue |
| Dialogue | Character | Parens | Character |
| Shot | Action | Transition | Character |
| Transition | Scene | Scene | Shot |
| Text | Text | Action | Scene |
| Note | Action | Action | Scene |
| New Act | Scene | Scene | Action |
| End Act | New Act | Action | Scene |
| Lyrics | Lyrics | Dialogue | Parens |

  - [INFERRED] `shift` is the Shift+Tab (reverse) target. A separate `shiftEnter` exists for custom types.
- **Shortcuts** [DIRECT] Each type has an `alt` letter and a `shortcut_code` (S, A, C, D, P, H, T, X, O, V, E, L). The element picker renders `[letter] Name` and selects a type by keyCode. There is also `shortcut_num` 1–9 (Character=1, Dialogue=2, Paren=3, Action=4, Scene=5, Shot=6, Transition=7, Text=8, Note=9). [INFERRED] These are Ctrl/Cmd+digit. The binding code was not found.
- **Auto-format** [DIRECT] Toggles `N_AFP`/`N_AFS`/`N_AFT`/`N_AFC`/`N_AFD`. They do the following: typing "(" makes a Parenthetical; "INT."/"EXT." makes a Scene; a line ending "TO:" makes a Transition; a bare name makes a Character; "Name:" makes Dialogue.
- **Autocomplete** [DIRECT] There are per-script lists `characters, character_parens, scenes, scene_hyphens, scene_hyphen_slash, transitions`. The defaults are:
  - Scenes: `INT. `, `EXT. `, `I/E. `, `INT./EXT. `.
  - Character parens: `(V.O.)`, `(O.S.)`, `(O.C.)`, `(SUBTITLE)`.
  - Times: DAY, NIGHT, CONTINUOUS, LATER, MOMENTS LATER, MORNING, EVENING, AFTERNOON, SUNSET, SUNRISE.
  - Transitions: 14 entries, including CUT TO:, SMASH-style `SLAM TO:` and `INTERCUT WITH:`.
  - Lists are localised (ar/zh/de).
  - The FDX export writes a `<SmartType>` block with Extensions, SceneIntros (separator `". "`) and TimesOfDay (separator `" - "`).
  - A trailing ` (CONT'D)` is stripped when a character is matched. "SAME/CONTINUOUS" inherits the previous scene's time in reports.
- **Pagination/format** [DIRECT]
  - Page is 816×1056 px (8.5×11 in at 96 dpi). Page margins are top 96, bottom 96, left 144, right 96 px (1/1/1.5/1 in).
  - Screenplay template offsets (px, relative to the left margin): Dialogue left 96 / right 149.76; Character left 192; Parens left 144 / right 187.2; Transition right 48.
  - `more_text` "(MORE)", `contd_text` "(CONT'D)", option "Add CONT'D for consecutive dialogue", `scene_continued_top/bottom/number`.
  - Default font is Courier Prime.
- **Revisions** [DIRECT]
  - Colour names: Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, Tan, then "2nd White"… "2nd Tan".
  - Asterisk margin marks (`visible_asterisk_lines`), `locked_pages` / "Unlock pages", `omitted_line` scenes, locked scene numbers, `header_text:"{REVISION}"`.
  - "Revision tracking for production, writer, or draft".
- **Engine/collab** [DIRECT] Custom contenteditable built on jQuery and `rangy`, not a framework editor. Firebase Realtime DB is used per document (`child("formatting")`, `notes`, `history/snapshots`, `revision_tracking/list`). Firestore holds `duet/…/branches` and checkpoints. The legacy path uses Firepad and CodeMirror (`firebase_firepads`, title page as a firepad). `localforage` is used for local storage. Change records have the shape `{c,l,t,u,v}`: client, path, time, user, value. Alternate lines exist (`visible_alternate_lines`). Tags are coloured.
- **Story/production** [DIRECT] Outline types (Outline 1–3), scene cards, location/character breakdown report ("Breakdown the location, timing, and characters in each scene"), formatting checker, stats, writing goals/schedule. Fountain parser (`legacy.bundle.js`). Import formats: PDF/FDX/Celtx/Word/Fountain. Export formats: PDF/FDX/Celtx/Fountain. [INFERRED] No stripboard or call sheet appears in this bundle.

## Celtx (`ux/scripts/5321.js`, Closure-based)

- **Element model** [DIRECT] Paragraphs are `<p class="…">`. Classes: `sceneheading, action, character, dialog, parenthetical, transition, shot, text, act`, plus `dual=true` and two-column `.col1/.col2` for dual dialogue. The formats are `cx.editor.format.Screenplay|Theatre|AV|Audioplay|Comic|SketchComedy`.
- **Flow tables** [DIRECT] Constructor args are `(enter, allowBlank, blankEnter, tab)`, exposed as `getEnterFlow/getBlankEnterFlow/getTabFlow`. Screenplay values:
  - Enter: scene→action, action→action, character→dialog, dialog→character, paren→dialog, transition→scene, shot→action, text→text.
  - **Enter on an empty line**: action→scene heading, character→action, dialog→action, scene→action, transition→scene.
  - Tab cycle: scene→action→character→dialog→paren→transition→shot→text→scene.
  - `allowBlank` is `{}` for screenplay. AV and Comic formats allow blank sceneheading/shot.
- **Autocomplete** [DIRECT] Plugins `CharacterAutoComplete` and `SceneHeadingAutoComplete` collect every `.character` / `.sceneheading` paragraph's text, de-duplicate it and upper-case it. The slug parser knows `INT./EXT.`, `EXT./INT.`, `INT.`, `EXT.`, `I/E.`, `INT/EXT`. Its time list is MOMENTS LATER, CONTINUOUS, AFTERNOON, MIDNIGHT, MORNING, EVENING, SUNRISE, SUNSET, NIGHT, LATER, NOON, DUSK, DAWN, DAY (with es/fr/pt). `isNight` uses this list.
- **Pagination** [DIRECT] Default `Config.metas`:
  - `CX.dialog.breakbottom.text "(MORE)"`, `breaktop "(CONT'D)"`, `autocharcontinueds false`.
  - Scene breaks: `"(CONTINUED)"` / `"CONTINUED: "`.
  - `CX.sceneNumbering "both"`, `customSceneNumbering`, `widowsorphans`.
  - PDF layout: US Letter, top/bottom 72 pt, left 108 pt, font 12 pt, line 13 pt, **53 lines/US page, 58 lines/A4**, 61 chars/line.
  - Revision span colours `colour1..7` (#A0FFFF, #FFA0FF, #FFFFA0, #A0FFA0, #FFD700, #FFA0A0, #EB5E66). Revision colour is set per file.
- **Engine** [DIRECT] Classic: Closure `goog.editor` contenteditable with plugins (`getTrogClassId`). The newer path is `scriptDataFormat:"prosemirror"` and print type `cxpm-screenplay`, which [INFERRED] means a ProseMirror editor loaded after login. Persistence uses Atom/REST `/feeds/...`. No CRDT is visible.
- **Production** [DIRECT]
  - Breakdown categories: Actor, Animals, BackgroundActor, Camera, CGI, Cast, Construction, Electrics, Extras, Greenery, Hair, Lights, Livestock, Location, Makeup, MechFX, Misc, Music, OpticalFX, Props, Set, SetDressing, Sound, SoundFX, SpecialEquipment, SpecialFX, Stunts, Vehicles, Wardrobe, Weapons, and more.
  - Print types: `callsheet, stripboard, shooting_schedule, shotlist, sides, dood` (Day Out of Days), `storyboard, scene_summary, resource_conflict`.
  - Beat board, index cards, cast and crew departments.
  - Import: `.celtx`, `.fdx`, `.pdf`, `.doc(x)`, `.xlf`, `.cxscript`.

## Final Draft Cloud (`_next/static/chunks/8765-c1f3b18e060a16c4.js`)

- **Element model** [DIRECT] ProseMirror node specs in a TipTap-like style (`name, tag:"div", styles, paginateAs, commandName, returnTo, tabTo, keyboardShortcut`). Node names: `sceneHeading, action, character, parenthetical, dialogue, dualDialogue, dualDialoguePart, transition, shot, castList, newAct, sequence, endOfAct, summary, outline1-3, note, music, sfx, general, titleParagraph`. The FDX numeric map runs 2=Scene Heading … 12=End of Act.
- **Enter (returnTo) / Tab (tabTo) / shortcut** [DIRECT]:

| Element | Enter | Tab | Key |
|---|---|---|---|
| sceneHeading | Action | Action | Mod-1 |
| action | Action | Character | Mod-2 |
| character | Dialogue | Transition | Mod-3 |
| parenthetical | Dialogue | Dialogue | Mod-4 |
| dialogue | Action | Parenthetical | Mod-5 |
| transition | Scene Heading | Scene Heading | Mod-6 |
| shot | Action | Action | Mod-7 |
| castList | Action | Action | Mod-8 |
| newAct | Scene Heading | Scene Heading | Mod-9 |
| general | General | General | Mod-0 |
| sequence / endOfAct | Scene Heading | Scene Heading / New Act | Ctrl-Shift-8 / 9 |

- **Indents** [DIRECT] Values are relative to the content box. Scene and Action have left 1in and right 0.5in. Character has left 3in and right 0.75in. Dialogue has left 2in and right 2in. Paren has left 3in and right 2.5in. Transition is right-aligned with left 5.5in. Scene headings are uppercase with margin-top 2em. `preventSplitting` covers sceneHeading, character, parenthetical, transition and dual dialogue.
- **SmartType** [DIRECT] There are chained providers `SceneIntros → Locations → TimesOfDay` (`nextProviderName`, open/close delimiters, defaults `". "` and `" - "`). `Characters → Extensions` opens on `"("`. There is also `Transitions`. A guided "page one" mode works like this: press I/E for the intro, TAB to confirm, type the location, then pick from DAY/DUSK/NIGHT/AFTERNOON/MORNING/EVENING.
- **Pagination/numbering** [DIRECT] The pager is "Paige", with page size 8.5×11 and header/footer margins defaulting to 36 pt. FDX `dialogueBreaks` and `sceneBreaks` settings are parsed (automaticCharacterContinueds, top/bottom text). Scene numbering offers `1A` or `A2` style, Courier Final Draft Bold 12, left 0.75in / right 7.375in.
- **Revisions** [DIRECT] A revision-marks plugin draws margin marks (`revision-margin-mark`). There are `lockedPages` with `revisionIdAtPageCreation`, a revised-page tint, and settings tabs Numbering/Revisions/Locking/Tags. [INFERRED] No standard colour-name list appeared in this chunk. The 12-colour map (Pink…Gray) is for ScriptNotes/tags.
- **Collab/offline** [DIRECT] Collaboration uses paragraph locks (`paragraphLocksEnabled`), `deltaSaveEnabled`, "Paragraph updated by a collaborator", and "Applied a change from another tab". [INFERRED] This is paragraph-level last-writer-wins, not OT/CRDT. IndexedDB `fd-documents` holds `snapshots` and a journal, and drafts are diffed against the cloud base by paragraph hash. Other features seen: ScriptNotes, Beat Board split view, version history and restore.

## Not visible pre-login
- WriterDuet: the binding code for Ctrl+digit, full pagination widow/orphan rules, and the production scheduling UI.
- Celtx: the ProseMirror ("cxpm") editor itself and its key handlers, and real-time collaboration.
- FD Cloud: the Enter-on-empty behaviour, standard revision colour names, any breakdown/scheduling (none seen), and Fountain/PDF import code.

## Implications for SWDR's editor
1. Use a data-driven element registry with `enter`, `tab`, `shiftTab`, `enterOnEmpty`, `shortcut`, `paginateAs`, `caps`, and indents, so formats (screenplay/stageplay/AV) only swap tables.
2. Default flow (all three agree): Scene→Action, Action→Action, Character→Dialogue, Paren→Dialogue, Transition→Scene. For Dialogue→Enter, offer Character (WD/Celtx) vs Action (FD) as a setting.
3. Tab: Action→Character, Dialogue→Paren, Paren→Dialogue (FD) or Character (WD), Scene→Action. Enter on an empty Action converts it to Scene Heading. Enter on an empty Character/Dialogue converts it to Action (Celtx).
4. Shortcuts: Mod-1..9/0 in FD order (Scene, Action, Character, Paren, Dialogue, Transition, Shot, Cast List, New Act, General), plus letter keys inside the element picker.
5. Use chained SmartType providers: SceneIntro (INT./EXT./I/E./INT./EXT.) with delimiter ". ", then Location (from the document), then " - " TimeOfDay. Character autocomplete comes from the document, and "(" opens extensions (V.O.), (O.S.), (O.C.), (CONT'D), (SUBTITLE). Transitions come from a fixed list plus the document.
6. Auto-detect element type: "(" becomes Paren, an INT./EXT. prefix becomes Scene, a trailing "TO:" becomes Transition, and an all-caps name becomes Character. Each can be toggled.
7. Paginate in a dedicated layer. Use Letter 8.5×11 with margins 1/1/1.5/1 in, Courier 12 pt, about 54–55 lines per page (Celtx uses 53). Never split Scene/Character/Paren/Transition. Make (MORE)/(CONT'D) and (CONTINUED)/CONTINUED: configurable, along with automatic character CONT'D.
8. Revisions: use the standard colour sequence White→Blue→Pink→Yellow→Green→Goldenrod→Buff→Salmon→Cherry(→Tan), then "2nd" cycles. Add asterisk margin marks, locked pages with A-pages, and locked scene numbers styled 1A or A2.
9. Store each paragraph with a stable id and per-paragraph hashes. Use paragraph-level locks or merges and IndexedDB snapshot plus journal for offline (FD pattern). Keep the CRDT optional.
10. Model production data from the start: breakdown tag categories (Cast, Extras, Props, Wardrobe, Vehicles, SFX, Makeup, Hair, Animals, Stunts, Set Dressing, Music, Sound…) keyed to scene ids, feeding stripboard, shooting schedule, DOOD, call sheet, sides, shot list and storyboard. Use FDX (with SmartType block) and Fountain as interchange formats.

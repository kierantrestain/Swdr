# Reference workflows and release checks

The benchmark compares writing and production behaviour through official walkthroughs and authorised visible screens. SWDR uses its own interface and a neutral, synthetic test project. Proprietary interchange formats require a genuine permitted sample and a tested loss report.

| Benchmark | Evidence and workflow checks |
| --- | --- |
| Celtx, Final Draft, WriterDuet | [Editor, revisions, collaboration and interchange](reference-a.md) |
| Arc Studio, StudioBinder, OpenDraft | [Planning, production and open-source baseline](reference-b.md) |
| Pinned OpenDraft baseline | [Source and licence audit](opendraft-baseline.md) · [Pinned runtime and editor evidence](opendraft-runtime.md) |
| REA captures for all six products | [Evidence IDs, hashes and access results](rea-captures.md) |

## REA setup

The official release selected at kickoff was [rea-agents 6.9.0, commit d74549e](https://github.com/morluto/rea/releases/tag/rea-agents-6.9.0). Initial local runs hit npm registry DNS and browser process restrictions. The team retried in an isolated Linux sandbox using the [documented exact-origin discovery and screenshot workflow](https://github.com/morluto/rea/blob/rea-agents-6.9.0/docs/guides/web/browser-observation.md). All six references had at least one rendered public viewport. The evidence index records 13 rendered public pages, three access interstitials and two loopback captures from the pinned OpenDraft build.

The pinned source maps OpenDraft v2.13.0 to `41fd8b90c22309729f807f388d36b16d700eea38`. The lead verified the Git tag independently. The benchmark team built it, opened the editor and typed a synthetic script in Chromium. The runtime report describes the boot, keyboard proof and remaining AV, history, collaboration and interchange checks.

## Visual references

All ten images in `SWDR_10_Visual_References.zip` were opened before UI implementation. The archive is a design input. SHA-256 `4cf0a94515b70bcd9e5ad63e04096ba7bdb2f1a22001551093cc9b5e444edb9f`.

| Image | Decision | Acceptance |
| --- | --- | --- |
| 01 Home | Slate header, quiet recent-work panel and project list | New, import and resume actions are visible on Home. The preview comes from the current manuscript. |
| 02 Write | Cream desk, white measured page and short toolbar | Scenes and notes open on demand. The page remains centred while writing. |
| 03 Focus | Manuscript and quiet status | Enter and leave Focus with the same caret, scroll and manuscript. |
| 04 Import | Source and editable conversion side by side | Review ambiguous elements and reimport links before committing. |
| 05 AV | Timecode gutter, equal Video and Audio columns | Cue editing and reordering update end time and duration totals. |
| 06 Outline | Beat cards by act | A linked beat opens its scene and keeps its ID when reordered. |
| 07 Series Intelligence | Relationship web isolated from the manuscript | Season and as-of filters constrain relationships and story events. |
| 08 Character dossier | Character facts, arc and source links | A recorded interaction opens the exact retained revision/line. |
| 09 Editorial | Segment rail, document and evidence panels | Issues derive four outputs from one frozen version of the segment data. |
| 10 Stripboard | Day bands, cast and scene headings with restrained colour | Review revised scenes, check scheduling conflicts and issue a dated call sheet. |

# REA capture index

The disposable SWDR sandbox ran the official `rea-agents@6.9.0` CLI on Node 24.22.3. Playwright 1.60.0 picked Chrome for Testing 148.0.7778.96. Its browser installer rejected Ubuntu 26.04, so the sandbox used the matching official headless build and installed the required Linux libraries. Chromium used a clean, unauthenticated profile on loopback CDP. Each screenshot is 1440 × 900. REA's reported artifact SHA-256 matched a separate hash of each decoded PNG. [REA release](https://github.com/morluto/rea/releases/tag/rea-agents-6.9.0) · [Browser workflow](https://github.com/morluto/rea/blob/rea-agents-6.9.0/docs/guides/web/browser-observation.md) · [Chrome build](https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/linux64/chrome-headless-shell-linux64.zip)

For each official page, navigate in Chromium, position the viewport using ordinary scroll, discover the current target within the origin and capture it. The names below match the PNG and metadata stems stored in the disposable sandbox during the run. The session expired after capture. This index preserves the evidence identifiers and verified hashes. The publisher PNGs were kept off the repository and the local transfer was incomplete.

```sh
rea list-browser-targets http://127.0.0.1:9222 --allowed-origins "$origin" --json
rea capture-web-screenshot http://127.0.0.1:9222 "$target" --json
```

## Public viewports

The initial browser pass returned 13 successful pages and three visible HTTP 403 security checks. The alternative Celtx captures include the official Film & TV tutorial page, commercial writing guide and call-sheet breakdown. These public pages show their published examples. A signed-in feature, export or live collaboration journey needs its own runtime test. See the per-workflow checks in [Celtx, Final Draft and WriterDuet](reference-a.md) and [Arc Studio, StudioBinder and OpenDraft](reference-b.md).

| Capture | HTTP | Viewport evidence | REA evidence ID | PNG SHA-256 | Bytes |
| --- | --- | --- | --- | --- | ---: |
| [`celtx-editor`](https://support.celtx.com/hc/en-us/articles/360009310173-The-Film-TV-Script-Editor) | 403 | Security verification screen. Editor content unavailable in this browser. | `ev_5e5cef7e03c1bf7f7d222baef9afd9060ee5bdea244ba796276a028bb8852a6e` | `8202f8015e02bba4335d47ef2d8b0997efb4d1eb98d88f8efff6d3e77240c7d6` | 42,341 |
| [`celtx-av`](https://support.celtx.com/hc/en-us/articles/360038992353-Multi-Column-AV-Script-Editor) | 403 | Security verification screen. AV editor content unavailable in this browser. | `ev_d4b0cd242dadf7031612fe3ae8dbddb0c0516d09c69cd3d48aac5523169a8952` | `0bd946c47f8a99b98e92a4f677f2781794838181ffd4b50fcf6dbaab716e1e39` | 42,164 |
| [`celtx-film-alternate`](https://www.youtube.com/watch?v=ScdeRxot-co) | 200 | Official Film & TV tutorial player page. Keyboard playback unverified. | `ev_1ee2ac4102a90f7d351b7a2b6b320bbb3e4af646d4fa52c1b21ee7257adb8327` | `3705cbf082cf8237c656c7ed20348e4e5fa465d10c0848b281a84fbb0b9a65e5` | 592,764 |
| [`celtx-screenplay-blog`](https://blog.celtx.com/how-to-write-a-script/) | 200 | Celtx screenplay-writing guide and article image. | `ev_188a11ab68a3dccdf5fafa670ae71802bcc27d37ec5530704fb16fbea2b20e1e` | `1c242ee50c965d2ed6b5e3bf9069932fc29f78d0a32e375f8469a1ea6726565e` | 307,540 |
| [`celtx-av-alternate`](https://blog.celtx.com/how-to-write-a-tv-commercial-script/) | 200 | Celtx commercial-script guide and its opening illustration. | `ev_135178b00b61ac285a3250e90734bf78419c53c17ea5dcd0d3bb7d9790864d0b` | `d4f630a54cf9a24ccc9546232712f9041bdf4d9ad257c15ee911e4dc25b9ae67` | 491,615 |
| [`celtx-production-alternate`](https://blog.celtx.com/how-to-make-a-call-sheet/) | 200 | Call-sheet example and breakdown. | `ev_a97c244eb4d4a22cffd8bb55a45df102811e9a3f1ca3e0ff191063c6f537e8ea` | `0f3aae6885a67d794e6561322c42138fe80b9b768d83bf2f755070c24abab9fe` | 111,872 |
| [`final-draft-features`](https://www.finaldraft.com/products/features/) | 200 | Official feature walkthrough and screenshots. | `ev_c4863acdd1e3d9cb9656154a6194eceb944bdc4d29ded78db5a5558cfab00d47` | `696ab92cfcef396cd762ac03f14ee589d70f6963c1e6948ee5a7119b2a4eadfc` | 415,924 |
| [`final-draft-dual`](https://kb.finaldraft.com/hc/en-us/articles/15575256060564-How-can-I-make-my-characters-and-dialogue-side-by-side-on-the-page) | 403 | Security verification screen. Dual-dialogue help content unavailable in this browser. | `ev_abc108070877ea1efcd14735c36bad314c0a4d7cc1ef491e31192a790eae3dd1` | `84350c133e56ad1632c0da2e9e49ef9d09392337812c5abfe1972f86015ba3ba` | 41,890 |
| [`writerduet-cowriting`](https://www.writerduet.com/article/416-a-guide-to-effortless-co-writing-in-writerduet) | 200 | Co-writing walkthrough covering simultaneous and separate writing. | `ev_59ef8792942843923a48a8c428e6af51020983877ae73d705254f64c6b92a608` | `845279ec25d73ccbfbd474c6812f67c183be3f9c9c9194c77dbfb7baddce17a6` | 194,542 |
| [`writerduet-export`](https://www.writerduet.com/article/261-export-a-document) | 200 | Export walkthrough and embedded example. | `ev_038b1c91c205e8b9f8a3b05a4f6ecbf4849f2475778f753cbb7e369f93fc4281` | `d5ae0ae07067651fe3b1e73bff6a22a08417d01934f38e1d7660b8e511f3df78` | 214,533 |
| [`arc-plot-board`](https://help.arcstudiopro.com/guides/the-plot-board) | 200 | Plot Board walkthrough with two rendered illustrations. | `ev_4ab33024f7871fe5f1904c10e7a63bbb573bf80ee0b08f35a88eb2bc8b4c5c67` | `a8cc34b66839994a46d1b7fdb157f1b1718a078cab57dfb6e86dc9d1406a95fb` | 222,024 |
| [`arc-focus`](https://help.arcstudiopro.com/how-tos/viewing-settings/how-do-i-start-writing-in-focus-mode) | 200 | Focus walkthrough with editor illustration. | `ev_d81659d98350ffdeddedf76f1a2909cc34b2f69aa1b0c929b660e6a559923f21` | `9e1b3f2029e969905ef616723d02b2ef6fbec2a650e8c96c96260aafd6902b1a` | 123,468 |
| [`studiobinder-revision`](https://support.studiobinder.com/en/articles/12023533-how-to-sync-a-revised-script) | 200 | Production revision sync and review with two rendered UI figures. | `ev_0d2f83178dcb8341b75267f82ddee528e892150cf93dce88beec8fc9f1c45dc3` | `fa59e079542d96abcc6008f307151d0297ca5c5ff89f2a041be6d012ff891942` | 128,399 |
| [`studiobinder-production`](https://support.studiobinder.com/en/articles/419954-how-to-create-a-call-sheet-from-your-stripboard) | 200 | Stripboard call sheet creation and customisation with two rendered UI figures. | `ev_391d47775d3580810e9143e5d37cdf1a3a5ef5a1ea5429f299dc7836a4c5a64f` | `3a3dd455ea9a223433a6567ff15fef96aaecd8ddf072201f565b241e4bd88632` | 136,522 |
| [`opendraft-public-editor`](https://open-draft.com/) | 200 | Public application entry. The deployed build was undisclosed. | `ev_102c44669ea71aaae472f0290ced2b0dbce8d5498ac2d06936539c137f485c7a` | `fe990acd5e98dfedfe7af4495e6cdd4be897f9877b7d981403d65a89f0b508d5` | 97,056 |
| [`opendraft-official-demo`](https://proteus-technologies-private-limited.github.io/OpenDraft/#screenshots) | 200 | Official OpenDraft introduction and video thumbnail. | `ev_0a2867994d7560cb821eeeb36ec7c488ba4941e64e1192384298621eed136772` | `bd62123f3489b8e504defae6dd22c880517ed8256d36775ce81d25859d9d75d8` | 441,202 |

## Pinned OpenDraft runtime

The benchmark worker built the `v2.13.0` source at `41fd8b90c22309729f807f388d36b16d700eea38` and used the normal self-hosted browser editor at `http://127.0.0.1:8000`. `/health` returned `{"status":"ok"}`. The synthetic screenplay followed the documented format entry, including Ctrl+1 for Scene Heading, Enter for Action, Tab for Character and Enter for Dialogue. The navigator registered the heading. [Baseline report](opendraft-baseline.md)

| Capture | Viewport evidence | REA evidence ID | PNG SHA-256 | Bytes |
| --- | --- | --- | --- | ---: |
| Startup and editor | Clean profile at the running pinned app. | `ev_e8f9cf4943da1297ce44b28559e848cc81a5aee9b513c608cbf8beaccd3ea0dc` | `c6e61467205fc7a19d9f601a75c37093fb22e9e1be2f03e43501f3ab72291e1d` | 100,023 |
| Synthetic screenplay | Typed manuscript and recognised scene. | `ev_91fcde12511f6db8bda146eee64a1dea1a910d3ec74bb45e8afbd0c7d70361cb` | `3322976fd5030333f9737a6a741c53b619c2325f1205b229ea07ac1103fff1ff` | 43,890 |

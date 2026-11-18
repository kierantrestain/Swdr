# OpenDraft v2.13.0 runtime verification

OpenDraft ran from the exact [v2.13.0 source](https://github.com/Proteus-Technologies-Private-Limited/OpenDraft/tree/41fd8b90c22309729f807f388d36b16d700eea38) on loopback inside an isolated Linux x86-64 test machine. The checkout verified `git rev-parse HEAD` = `41fd8b90c22309729f807f388d36b16d700eea38` and `git tag --points-at HEAD` = `v2.13.0`. The browser and REA used a new Chromium profile, with no publicly exposed app or debugging port. All manuscript text was synthetic.

## Setup and licence decisions

| Step | Observed result |
| --- | --- |
| Toolchain | Git 2.53.0, Node 24.22.3, npm 11.19.1, Python 3.14.4, Chromium 148.0.7778.96 and REA 6.9.0. |
| Frontend | The initial `npm ci` failed when ONNX Runtime's optional CUDA 1.21.0 asset returned HTTP 404. The package's CPU-only install option allowed the checked-in lockfile install and `npm run build` to complete with Vite 8.0.3. Browser features used the built frontend. |
| Backend | `pyinstaller==6.13.0` rejected Python 3.14. The browser runtime mounted the frontend and installed the exact remaining requirements from a temporary copy. `pip check` succeeded with FastAPI 0.135.2, Uvicorn 0.42.0 and PyMuPDF 1.27.2.2. |
| Collaboration stack | The separate collaboration server compiled from its lockfile with Hocuspocus 3.4.4 and Yjs 13.6.30. Service startup and a backend health response do not establish two-writer sync. |
| Boot | The pinned backend returned `{"status":"ok"}` at `http://127.0.0.1:8000/health`. Chromium loaded the rendered workspace from that listener. |

The Python omission applies to desktop packaging only. SWDR did not adopt the upstream Python PDF engine or bundled dependencies. The [pinned install guide](https://github.com/Proteus-Technologies-Private-Limited/OpenDraft/blob/41fd8b90c22309729f807f388d36b16d700eea38/docs/INSTALLATION.md) and [licence and format audit](opendraft-baseline.md) give the source and redistribution details.

## Browser and REA evidence

Discovery used `rea list-browser-targets http://127.0.0.1:9223 --allowed-origins http://127.0.0.1:8000 --json`. Each `rea capture-web-screenshot http://127.0.0.1:9223 TARGET_ID --json` targeted the exact local browser tab at 1440 × 900. The logs recorded the evidence IDs, decoded PNG hashes and byte counts.

| Visible workflow | Observed behaviour and acceptance check for SWDR | Capture reference |
| --- | --- | --- |
| Onboarding and workspace | A fresh profile opened the manuscript and showed blank, sample and import entry points. The status read **Local only**. SWDR Home gives explicit entry points and separates local persistence from team sync. | Evidence `ev_e8f9cf4943da1297ce44b28559e848cc81a5aee9b513c608cbf8beaccd3ea0dc`. PNG SHA-256 `c6e61467205fc7a19d9f601a75c37093fb22e9e1be2f03e43501f3ab72291e1d`, 100,023 bytes. |
| Screenplay writing | Ctrl+1 selected Scene Heading. Enter selected Action, Tab on the next empty Action selected Character, and Enter moved to Dialogue. The authored heading appeared in the Scene Navigator. In SWDR, preserve typed screenplay elements, allow keyboard-only writing and use stable scene navigation. | Evidence `ev_91fcde12511f6db8bda146eee64a1dea1a910d3ec74bb45e8afbd0c7d70361cb`. PNG SHA-256 `3322976fd5030333f9737a6a741c53b619c2325f1205b229ea07ac1103fff1ff`, 43,890 bytes. |

The captured screenplay contained a heading, action, character cue and dialogue. The element types were checked against the rendered editor. The desktop build, native OS file dialogs and third-party live trial exports are independent checks.

## Remaining trials

The browser displayed the File, Export, Versions and Collaboration entry points. The next AV and export command returned HTTP 410 `sandbox_stopped` when the disposable session reached its lifetime limit. AV rows and timing, character and relationship tools, history restore, offline reconnect, collaboration UI and genuine release file exports remain unverified against this running build. The screenshots and their raw REA results were held in the disposable machine during the run. The capture IDs and verified hashes above survive in this record.

The earlier [baseline audit](opendraft-baseline.md) records the initial desktop and shell access failures. This runtime result supersedes those entries for the loopback browser boot, screenplay editor and REA viewport capture.

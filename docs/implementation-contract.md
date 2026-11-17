# SWDR implementation contracts

The lead owns `src/model.ts`, app shell, shared layout, dependency configuration and integration. Per-role branches and worktrees isolate edits. Agents merge via the lead.

| Owner | Paths | Dependencies |
| --- | --- | --- |
| Workspace and data | `src/workspace/`, `api/team.ts`, `server/` | Shared project and document model |
| Writing | `src/writing/` | Shared model, comparable pages and PDF layout contract |
| Interchange | `src/interchange/` | Shared model, writing layout exports, project archive contract |
| Story and editorial | `src/story/` | Shared model, retained document source revisions |
| Production | `src/production/` | Shared model, issued snapshots and reviewed revision mappings |
| Independent QA | `tests/`, `playwright.config.ts` | Integrated application, module APIs and build |
| Benchmark workers | `docs/research/` | Official documentation, permitted visible workflows and verification |

IDs are opaque stable UUIDs. An episode still has its original ID after renumbering. Scene headings have an ID distinct from their text block. Source references include the project, document, revision and applicable episode and scene or block. Revision-sensitive views resolve the live head or a retained immutable snapshot. Outputs capture document content and source revision at issue time. Restore forks a head with a fresh revision ID and leaves the stored snapshot intact.

Each screen gets the active project and document plus functional update callbacks. Access scopes are validated server-side in the hosted route. A local write can succeed while a hosted write is pending. Durable local records and the sync base stay separate.

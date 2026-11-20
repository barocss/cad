# Open CAD backlog: complete routing snapshot

Snapshot: 2026-11-20T11:47:14+00:00. Work base and remote main: `ff8c3c2157d88aa35e8e032427dffe98e3558d75`.

## Scope and evidence

GitHub REST `repos/barocss/cad/issues?state=open&per_page=100` was read with pagination. The response contains **229 open issues, 0 pull requests, 229 unique issue numbers**. Each issue has one primary route below. Cross-cutting dependencies do not add to the count. The fetched API response had SHA-256: `5e331fc14bf8d6d3af81d9e811974abb47467ec8786426ef0df2fdd8bbc485ca`.

This is a title/label routing pass plus selected issue-body review. Selected storage and agent-render source/tests were inspected. This is not a whole-source audit, current product test, closure recommendation for all issues, or a readiness percentage. Open issue state is verified metadata. Capability coverage and acceptance remain UNKNOWN unless a linked bounded receipt states otherwise. No issue or product code changed for this inventory. Existing test and browser results cited below were read, not rerun.

## Current authority and migration limits

Use the [canonical roadmap](../../roadmap.md) at the pinned public cad main for P0–P6 names. P0 data loss and false output take precedence. P5 capability milestones follow when ready; selected older P1–P3 blockers remain valid work. The file reports whole CAD/core readiness as NOT_MEASURED. Its 192-issue census and 85 CAD-title count are historical; they are not the present 229-issue census.

Old issue bodies contain earlier P1–P7 schemes, D550 next-item text, local/cad-dev references, and links to barocss/barocss issue IDs. Those passages are historical contracts, not current execution or push authority. A cross-repository link is not a second open cad issue. Before executing an old leaf, resolve its current owner/state and mapped issue. This pass does not claim that every migrated link was resolved.

No duplicates were removed merely because titles overlap. In particular #620 is stale autosave recovery; #621 is a completed Save overwritten by another tab. #20 is reference resolution; #25 is pattern behavior. Umbrella epics and leaf work remain distinct records. Labels `blocked` appear on #184, #183, #327 and #282; `v3:running` on #374 and #373 is inherited metadata and is not proof of a live owner.

## Current completed scope and remaining work

The bounded #21 input, #20 reference, and #25 pattern work delivered by the pinned main is complete. Their parent issues remain open for broader acceptance. Do not restart those completed slices or infer that the parents can close. The index below describes scope ownership, not a new execution queue.

### #621: OPFS save collision fixed; native scope remains

The original OPFS overwrite is no longer an unresolved defect. Current `src/storage/handleStore.ts` holds the same Web Lock for browser-project/path through expected-tag check, native close and receipt. Native folders use only the adapter-local queue; the code explicitly excludes them, old clients and bypassing writers from the OPFS guarantee.

The [latest conflict UI proof](https://github.com/barocss/cad/issues/621#issuecomment-6912005455) covers both winner/loser roles, rejected Save with dirty edits retained, and autosave Restore. The [later copy-recovery proof](https://github.com/barocss/cad/issues/621#issuecomment-6990980830) covers explicit Project Close, separate downloaded copy and fresh Open, while retaining the primary. Current tests include `test/handle-store-multitab-opfs.test.mjs`, `test/opfs-project-conflict-browser.mjs`, and `test/project-conflict-copy-browser.mjs`.

**Remaining:** native-folder/alias identity and overlapping-write behavior; old or bypassing writers, weak size/mtime tags, and cross-file transactions are outside the bounded guarantee. Native `isSameEntry` alias observations were read-only, not an overwrite reproduction. These limits do not make the already-fixed OPFS repro an active P0 task. Native picker work remains held; adopt a specific guarantee and permitted test route before implementation.

### #620: known pre-Save autosave lifetime fixed; native UI unqualified

The [latest fix and proof](https://github.com/barocss/cad/issues/620#issuecomment-6910478067) includes autosaves requested before Save but completed during or after it. Current `src/storage/useProject.ts` captures the request boundary and associates late receipts with the accepted Save. `src/storage/project.ts` suppresses an offer only when saved-file and checkpoint tags plus SHA-256 identities match; it never deletes checkpoint bytes. `test/autosave-save-boundary.test.ts`, `test/project-autosave-feedback.test.ts` and `test/autosave-save-boundary-browser.mjs` cover the relevant positive and negative paths.

**Remaining:** native-folder UI qualification is NOT_RUN and picker work remains held. Unknown/other-session checkpoints, provenance failure/interruption and competing metadata writes deliberately retain recovery offers. An offer before optional provenance completes is not proof that the known same-session fix failed. This is not a general multi-writer save-generation contract. Do not repeat the old H=11 completed-checkpoint case as new implementation work.

## Next agent-facing capability: bind visual review to its exact model

Select a bounded implementation slice under **[#324](https://github.com/barocss/cad/issues/324)**: give an agent a machine-readable identity for the model and image it reviewed, and an explicit way to reject a request for an old model. This addresses the user-facing step “review this version, then change or approve it.” It is not another generic MCP smoke test.

Source inspection at the pinned base shows a concrete gap:

- `packages/barocss-cad-model/src/chat/toolDefinitions.ts` defines `render_views` input as `highlight` and `section` only. The grouped public entry is `query.render`.
- `packages/barocss-cad-model/src/chat/views.ts` caches by model content and options, but its public `ViewsResult` is only image, legend, views, layout and notes. The cache key is not returned as review provenance.
- `packages/barocss-cad-model/src/chat/part/views.ts` returns that metadata plus a separate PNG. `chat/contract.ts` lists no source revision or image digest in the render output schema.
- `apps/cad-studio/server/cadMcp.ts` already serializes calls and emits image content. `test/toolset-mcp.test.ts` and `test/tool-contract-mcp.test.ts` already cover discovery, grouped calls, schema results, edits and refusals. `packages/barocss-cad-model/test/views.test.ts` already covers PNG size, legend, highlight, section and cache reuse. Repeating those checks does not supply the missing review identity.

**Proposed result:** reuse the existing revision and evidence contracts to associate each render's exact source revision, view options and PNG digest. Admit an expected revision and refuse a mismatch before rendering. After edit/Undo/document switch, a previous review must remain identifiable as belonging to its original model; it must not qualify the new one. Preserve the document, history, selection and camera for this read action. A section render must identify the original model and section request rather than claim its temporary split model is an accepted edit.

This is a source-confirmed missing public contract, not a demonstrated stale-image corruption or queue race. #324 has no comments as of this snapshot. The exact candidate-versus-accepted representation, schema compatibility and downstream consumer must be fixed before implementation. Use the existing `query.rebuild` revision basis and evidence helpers after confirming they match the render's full source ownership. Do not expose an internal cache key as a stable API without that check.

Acceptance should connect one real agent review to one supported editable part: render A with provenance → edit to B → reject an A-pinned request against B → render B with a distinct identity → retain each PNG/legend pairing → native check → existing Studio Open → user dimension edit → Save/fresh Open. Add only changed-contract checks and this focused consumer. Existing protocol/PNG tests are prerequisites to reuse, not a new broad validation campaign. Live-model quality, token savings and multi-agent speed stay NOT_RUN/NOT_MEASURED unless actually measured.

Follow-up: the [revision-pinned local review and editable Studio handoff](../agent-review-part-2026-11-20/README.md) now cover the working-document path. The [local candidate review](../candidate-four-view-review-2026-11-20/README.md) now covers two attempts that reproduce identical geometry, an older image arriving late, retry and explicit approval.

### Dependencies and later AI work

- Pin current cad source, client and owned paths. Reuse grouped v2 discovery/describe and `runTool` approval gates; do not create a parallel geometry or tool implementation.
- #324's render provenance fits its revision-bound review scope. #204 WebMCP and #325 external semantic adapter are separate transports/consumers, not prerequisites.
- #322 connects requirements, candidate review, and editable Studio output. A follow-up read of the original issue comments found that all four referenced implementation issues closed with bounded product evidence. The current CAD tree retains the decisions for [call isolation](../tool-call-context-2026-11-10/README.md), [specification-to-task ownership](../spec-task-contract-2026-11-11/README.md), [candidate acceptance and cancellation](../candidate-atomicity-2026-11-11/README.md) and the [local two-worker runner with one writer](../local-task-run-2026-11-11/README.md). [D629](../reopen-local-task-run-2026-11-11/README.md) adds fresh Studio reopening of a pending or approved run. These receipts were inspected here. The candidate image follow-up exercised a retired attempt and its replacement using this runner. The [edit cost comparison](../agent-edit-cost-2026-11-20/README.md) measured the same rejected height and accepted retry through persistent stdio and Studio chat. Studio resends the current document as context. Both routes execute a targeted edit. The [native-refusal review](../native-refusal-candidate-review-2026-11-20/README.md) reproduced stale passing evidence in Studio after a refused approval. It covers the corrected display, a fresh decision on the same attempt, and protected FAIL and UNKNOWN cases in the host. External MCP client interoperability remains open. Whole-epic acceptance and live-model quality remain unmeasured.
- Real native geometry, independent checks, actual Studio/file use, and live model quality need separate results. A visual review cannot pass a failed or unknown native check.

## Examples of implemented or proved subsets inside open issues

- #21 records spline Undo/Redo, open-profile refusal preservation, same-radius no-op Redo retention, rectangle conflict recovery and several bounded diagnostics. The newer bounded input work is complete at the pinned main; broader direct-dimension/constraint acceptance remains open.
- #20 records limited Chamfer reopen, Hole bindings and Flange original-plate edits. These do not prove arbitrary reference remapping or all downstream features.
- #25 records selected pattern edit/source identity work. The selected latest identity slice is complete at the pinned main; the parent still contains other pattern and selection acceptance.
- #214 has a bounded terminal Fillet end-handle repair. General curves and multiple selection remain separate.
- #168–#182 are broad tracker epics. Their unchecked historical checklist is not proof of missing current code, and a current foundation test cannot close a whole epic.

## HOLD and proof boundaries

The HOLD route is separate from P0–P6 counts. An issue outside this route can still contain a held remainder, including the native-folder portions of #620/#621. It keeps Physics/Motion and manufacturing/equipment work visible without making it an active queue. Some issues in other routes also have held subscopes. Preserve broad fitter/NURBS/public-thicken and widening, nonzero-cone expansion, schema5/migration, owner UI redesign, ASME PDF mismatch, new GPU/browser CI and release/deployment gates. A naming/routing change lifts no gate. No mobile tests. No paid model run, new dependency, download, schema migration or release is part of this inventory.

## Counts by primary route

| Primary route | Count |
| --- | ---: |
| P0 — Protect work, identity and output | 15 |
| P1 — Sketch and edit a useful part | 41 |
| P2 — Draw, measure and exchange | 35 |
| P3 — Review static assemblies | 5 |
| P4 — Use Studio, Viewer and libraries | 29 |
| P5 — Extend geometry and surface quality | 28 |
| P6 — Reuse real files and project data | 7 |
| AI — Agent workflow, evidence and interoperability | 11 |
| PLAN — Product-wide scope and architecture | 4 |
| HOLD — Physics, Motion, rendering study or manufacturing | 54 |
| **Total** | **229** |

[The issue index](index.md) links each of the 229 issues once. Counts describe the queue. Feature readiness requires its own acceptance evidence.

## Additions since the 229-issue snapshot

A subsequent comparison on 2026-11-20 found 230 open issues. All original 229 were still open. Route [#740](https://github.com/barocss/cad/issues/740) to P1, part editing. The [Fillet row location delivery](../fillet-picked-edge-location-2026-11-20/README.md) covers hover and keyboard focus on the original straight edge, held preview updates, tangent-chain separation and native Remove/Apply. The next bounded modeling proposal is [#739](https://github.com/barocss/cad/issues/739): measure one independent rectangular Extrude against a single supported stock before offering an explicit Join target. Establish positive native overlap and contact-only refusal before changing the command UI.

## Reproduce the live census

```sh
gh api repos/barocss/cad/commits/main --jq .sha
gh api --paginate --slurp 'repos/barocss/cad/issues?state=open&per_page=100' > /tmp/cad-open-issues-inventory.json
jq '[.[][] | select(has("pull_request") | not)] | {count:length, unique:([.[].number]|unique|length)}' /tmp/cad-open-issues-inventory.json
jq -r '.[][] | select(has("pull_request") | not) | [.number,.title,.html_url] | @tsv' /tmp/cad-open-issues-inventory.json
```

A refresh changes the census. Keep this snapshot and its base separate from later issue edits. Reassess readiness against actual code, current owner instructions, open/closed leaf state and focused evidence before implementation.

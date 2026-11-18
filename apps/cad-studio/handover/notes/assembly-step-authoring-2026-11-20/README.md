# #207: proposal-only assembly step authoring

Limited implementation evidence, not completion of the whole issue. **#207 remains OPEN.** Validated runs used pre-integration `cda583b39`. Main `8edbd7d15` was subsequently fast-forward integrated without overlap. Post-integration rerun is **PENDING**; not all current-HEAD behavior has been retested.

This is a pre-push validation snapshot; exact pushed-SHA CI and integration checks are recorded separately when available.

## Contract and actual workflow

`assembly` / `add_step` takes a step name and exact occurrence IDs. The synthetic `p1` and `p2` intentionally share a display name. A direct public write is refused with `needs_approval` and leaves the input document unchanged. The public local runtime prepares an operation inside a proposal on a copy of the Studio-accepted document. Proposal/history metadata is added, but the step is not yet applied.

The fixture transports that proposal through a generated native file and public Open, rather than injecting hidden application state. Studio shows the intended name and `p2` in the proposal summary. The user path explicitly previews and accepts it, then the Steps panel identifies `p2`, not the same-name `p1`. Existing step note, view, explode and membership are preserved. Geometry inputs, occurrence placements, definitions and mates remain structurally unchanged. Undo/Redo restore the whole checked document, and native Save/fresh-context Open preserves the result.

A separate stale scenario changes only the existing step name through the actual Steps UI. Preview is disabled and Accept absent until **Rebase & preview**. Rebase leaves the proposal open; a subsequent explicit Accept retains the local name edit and adds the requested step. Rebase is not approval. Stale protection here is the Studio button state plus the Accept gate; the generic preview helper may still replay a stale proposal. This fixture does not claim that helper refuses replay.

## Results and failure history

- Baseline01 PASS: existing Steps UI, exact-ID core authoring and name-based API support were contrasted with the advertised chat action list. The unknown-tool probe alone was not treated as a product defect.
- Tests02: **62/62 PASS**. Model type02 and scoped lint02 PASS. Studio type01 PASS remains applicable because product code did not change afterward. These are scoped checks, not a full-suite claim.
- Lint01 initially failed on six unused variables in the new test. Replacing unused destructuring bindings with a shallow-copy-delete helper corrected the test; lint02 passed. This was not an existing baseline failure.
- The contract snapshot update is limited to the `add_step` assembly action enum addition.
- Actual01: normal and stale/rebase scenarios PASS, including explicit acceptance, Undo/Redo and Save/fresh Open. Receipt reports **0 page errors, 0 console errors, 0 source changes**. All five contexts, browser and server closed. Coordinator reported approximately **44 GiB** free after cleanup.

## Synthetic visual evidence

The PNGs are exact, unedited copies of actual01 captures:

- `normal-02-explicit-preview.png`: proposal preview before explicit acceptance.
- `stale-01-stale-refusal.png`: stale proposal with the recovery path, not an accepted change.
- `stale-03-exact-member.png`: accepted exact occurrence in the Steps panel after rebase.

The compact JSON summarizes selected receipt fields and checks. Raw receipts, host paths, stacks, authentication data, local server URLs and source manifests are deliberately excluded.

## Limits

This is a **local public runtime plus native-file transport** workflow, not an external MCP integration test. There is no independent geometry oracle, automatic authoring/approval, camera authoring, chat edit/delete-step qualification, or full-suite execution. Only the synthetic top-level occurrence setup and the two explicit approval paths are covered. Existing HOLD and broader issue requirements remain in force.

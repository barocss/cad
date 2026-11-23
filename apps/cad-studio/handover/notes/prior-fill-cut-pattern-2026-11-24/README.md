# D1831 — Repeat the direct earlier rectangular cut in a captured Fill mask

P1 rows 15 and 16. [Issue #25](https://github.com/barocss/cad/issues/25). Base `008a9dea148fb8d84aed7ef34295e6b8d192dca7`.

The retained D1830 Chrome control on the same stock refuses Fill cut pattern when Browser or History chooses Subtract 1. It reproduces at both desktop sizes and leaves the model, selection and Undo as they were. Selecting the current body still opens Subtract 2.

The explicit source identifies the original direct earlier rectangular through-Subtract. The current later Difference owns the stock. Preserve the Fill mask snapshot and its exact reference-point selection. Certify the original and each selected placement with the existing two-rectangle stock proof. The original stays when its reference point lies outside the mask. The mask does not clip a selected rectangular tool. An excluded candidate does not enter physical admission. A selected touching, overlapping or exterior cell refuses before geometry changes. The default current-source command and fluent API keep their existing contract.

- **PASS — Kernel and Model.** Native tests verify an original outside a narrow mask, two full selected copies, holes and outer boundary behavior, typed refusals for selected unsafe cells, and valid results when the same unsafe cells are excluded. The original and later named walls are retained. The new recipe field lowers explicitly to Kernel, renumbers, flattens and saves with the current target and captured mask. Suppressing the source sketch leaves its captured mask and native result unchanged. Revision-bound local command dispatch preserves both stable feature IDs.
- **PASS — desktop Studio.** Browser and History give the same recipe on 60 × 40 × 10 mm stock. The captured L mask admits X16/Y0 and X0/Y8 and excludes X16/Y8. The result has four independent rectangular apertures on both caps, one strict genus-four native solid and volume 23640 mm³. Y18 selects an overlapping cell and refuses without changing the document or Undo. Editing Y8 to Y5 moves only the second-row copy. The later center stays at (11, 27) mm. Undo, Redo and native Save/fresh Open retain the source, target and region snapshot.
- **PASS — verification.** 46 Kernel, 31 Model and 9 Studio tests. Kernel library, three type checks, scoped lint, Studio production build, driver syntax and Git diff check pass. Independent High review confirms the selected-offset and reference boundaries. Three external mutations fail their target checks when the Kernel ignores the source, skips selected placement certification, or Model drops the source. Actual Studio passes 7 Fill, 7 Linear, 8 Rectangular and 8 Path-control checkpoints. Zero page, console or watched source errors.
- **FAIL — corrected type checks.** The first Model check needed the suppressed sketch fixture context typed as StudioDoc. The first Studio check required a discriminated switch for the saved source label. Final Model and Studio type checks pass.
- **FAIL — inherited code-shape gate.** The three known spread-minmax counts remain in unchanged Kernel files.
- **NOT_RUN.** Whole local suites, mobile, other rendering backends, paid or remote Agent use, live MCP Fill proposal approval, arbitrary earlier sources and general path or dependent-reference cases. First mechanical CAD remains 8/10 accepted. Overall CAD remains unmeasured. #25 remains open.

## Reproduction

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve}-cut-pattern.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern linear-cut-pattern fill-cut-pattern curve-cut-pattern toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1831_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --fill
D1830_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/linear-control" --linear
D1828_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/rectangular-control"
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/path-control"
```

# D1702 — Review a saved sketch Chamfer resize before approval

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `56df9dba63b38831e98ad7a974278dc5509fb00b`.

For one open revision-pinned saved bevel resize on a tagged independent XY sketch with one straight extrusion, `proposals.list` supplies `modelReviewRevision`. `query.render` returns the existing four-view PNG, the candidate pins and `chamferResize.faces`. `query.inspect` uses the revision from that image. Both operations replay the proposal on a copy. L1 leaves approval to the Studio user.

The native check compares the exact replay to the stored sketch edit. It verifies the named carrier faces and reciprocal seams in the original and resized solids. For each seam endpoint, it measures the setback to the intersection of the carrier planes at that height. It compares the plane and all seam endpoints of each retained saved bevel on a shared carrier. A single saved bevel is also eligible. Tilted extrusions currently lose the producing feature ID in the native source record. Discovery omits the review pin for that scope.

## Verification

- **FAIL, base capability.** Local MCP found P1 at revision `f8a1897e55901243` with a generic proposal pin. There was no model review pin. The candidate render returned `MODEL_REVIEW_UNAVAILABLE`; the input file SHA-256 remained `902ba02e334ad6f956e243a62ac1bc05592d5f326737b2a9e5356809d79bd85e`.
- **PASS, local MCP.** Both named walls appear in the four-view legend. Wall `n1.side[e9]` between e3/e4 measures 6 to 8 mm, while wall `n1.side[e10]` between e4/e5 remains 6 mm with the same native plane. Incorrect base and proposal pins are refused. P1 and P2 produce byte-identical PNGs and different review revisions. Inspection refuses a missing image pin and a pin from the other proposal. Reads and refused L1 approval preserve the staged bytes.
- **PASS, actual desktop Studio WebGPU.** Create the two earlier chamfers in Studio, open the pending resize, preview −140 mm³ and explicitly accept P1. Undo restores both pending proposals and the original solid. Redo restores the accepted part. Save and fresh Open reproduce the exact native body, named planes and PNG. The accepted proposal refuses pending review. Seven Studio checkpoints record zero source changes, page errors and console errors.
- **PASS, desktop controls.** The original saved Chamfer proposal, grouped corner review and replace-first bored-wall review each pass approval and fresh Open with their native results intact.
- **PASS, local checks.** 42 focused Model tests and 17 Studio MCP tests. Scoped lint, Model types, production Studio build with types, browser driver syntax and Git diff check pass.
- **FAIL, inherited docs aggregate.** The generated refusal reference differs and API inventory `IV001` reports 44 expected and 46 actual direct members. The same two checks failed in [D1276](../two-guide-loft-agent-proposal-2026-11-15/README.md).
- **NOT_RUN.** Full local suites, WebGL2, mobile, paid model provider and the held B06 PDF group. First mechanical CAD remains 8/10 and B06 remains 6/7. Overall completion is unmeasured. Issue #324 remains open for client and task-cost evaluation.

The 10 mm extrusion has 12 native faces. The expected volume after the resize is `20000 − (8² − 6²) × 10/2 = 19860 mm³`. The native result is `19860.000000000007 mm³`.

| Pin | Value |
| --- | --- |
| Base revision | `53ad5edb32297b8f` |
| Candidate revision | `8486cbb3c8906065` |
| Native body SHA-256 | `41be67387c50e15152474708d78a4af3fa5bcca99ff097e305b590452ea9df4d` |
| Four-view PNG SHA-256 | `6b8476901a8540fc260185821b4713080f25193b43b0c16485f7f88c58653efe` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test saved-chamfer-resize-review corner-proposal-review saved-chamfer-agent-edit sketch-chamfer-edit replace-face toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{cornerProposalReview,part/modelCandidate,part/proposals,part/views,toolDefinitions}.ts \
  packages/barocss-cad-model/test/saved-chamfer-resize-review.test.ts apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
pnpm --dir apps/library-docs check:docs
D1702_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/resize-review" --review-resize
D1701_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/agent-resize" --agent-resize
D1697_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/corner-review" --review
D1669_SOURCE_FROZEN=1 node apps/cad-studio/test/bored-wall-candidate-review-browser.mjs \
  "$OUT/bore-review" "$D1668/replace-first/pending-current-donor.bcad"
git diff --check
```

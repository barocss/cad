# D1697 — Review native sketch corner groups before approval

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `c5a1a588a201476135489cba61f7016bba3ce655`.

`proposals.list` exposes a model review revision for one open grouped Fillet or Chamfer on a tagged independent sketch with one native straight extrusion. `query.render` reads the candidate on a copy and binds its four-view PNG to the base revision, proposal pin and native body hash. `query.inspect` takes the returned image review revision and reads both named walls from that candidate.

Each new wall must have the requested pair of original sides as native neighbors. The certificate checks the fillet cylinder and its tangent carrier planes or the two chamfer setbacks at the seams. Original side tags must survive. All review reads use the existing Agent tools and the existing Studio proposal approval.

## Verification

- **FAIL, parent capability.** Local MCP discovered P1 at base revision `5460b4f7068b13a2`. Its generic proposal revision existed but it had no model review revision. The candidate render returned `MODEL_REVIEW_UNAVAILABLE` and kept the input file bytes.
- **PASS, local MCP.** Both a convex and a reflex corner appear in each PNG and its view legend. Inspection maps `n1.side[e9]` to e3/e4 and `n1.side[e10]` to e4/e5. For the R6 Fillet the two cylinders face in opposite radial directions. The Chamfer has an equal 6 mm setback on both carriers at each wall. Both stale base and wrong proposal pins are refused. Two proposals with the same geometry give identical PNG bytes and different review revisions. The other proposal's image pin is refused. Review and refused L1 approval keep the proposal file bytes.
- **PASS, actual desktop Studio WebGPU.** Both proposals show the convex removal and reflex addition before approval with zero total volume change. Explicit user Accept changes the two walls. Undo restores the whole original model and both open proposals. Redo restores the accepted geometry. Save and fresh Open reproduce the reviewed native body hash, exact wall geometry and PNG bytes. The accepted proposal no longer accepts pending review. Twelve Studio checkpoints recorded zero worktree changes and zero page or console errors.
- **PASS, existing bored-wall review.** Both stock edit orders pass the pinned image and geometry comparison through preview, approval and fresh Open.
- **PASS, local checks.** 27 focused Model tests and 19 Studio MCP tests. Model and Studio type checks, scoped ESLint, production Studio build, browser driver syntax and Git diff check passed.
- **NOT_RUN.** Full local suites, live AI provider, WebGL2, mobile, advanced sketch point dragging and the held B06 PDF comparison. First mechanical CAD remains 8/10 and B06 remains 6/7. Overall completion is unmeasured.

The verified outline has eight original sides and a notch, on an XY plane turned 180 degrees so both edited walls appear in the fixed engineering views. The 10 mm extrusion has volume 20000 mm³ before and after each edit. Both strict closed B-rep outputs have 12 faces.

| Pending edit | Model revision | Native body SHA-256 | PNG SHA-256 |
| --- | --- | --- | --- |
| R6 Fillet | `99371fcbe647e5fc` | `f2f1ea7461c222828b4e69f56824606d7568ff884054463fd817549de0c79b0a` | `80236e8b7c444b008dd471e7a92f917b768afdf9fa1354d2c2291f9d80415e8d` |
| 6 mm Chamfer | `994334b5a29ef380` | `efb93c56665eb0c592bf8da8e7fa288b8341db434c495aab8a970fb25cfea9a8` | `f68e144dd77c6fd9c7c33747a99dc85468b9a1438a5b87f21f470513fb72708f` |

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory. The bore regression inputs are the two saved D1668 pending current-donor variants.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner-proposal-review revision-pinned-edit corner-batch toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal-review-availability
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/chat/{cornerProposalReview,part/modelCandidate,part/proposals,part/views,toolDefinitions}.ts \
  packages/barocss-cad-model/test/corner-proposal-review.test.ts apps/cad-studio/test/sketch-corner-batch-browser.mjs
node --check apps/cad-studio/test/sketch-corner-batch-browser.mjs
D1697_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/corner-review" --review
for order in replace-first wall-first; do
  D1669_SOURCE_FROZEN=1 node apps/cad-studio/test/bored-wall-candidate-review-browser.mjs \
    "$OUT/bore-$order" "$D1668/$order/pending-current-donor.bcad"
done
git diff --check
```

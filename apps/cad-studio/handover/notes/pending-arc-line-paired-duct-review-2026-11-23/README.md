# D1801 — Review both passages on a pending arc-to-line Sweep

P5 modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `79b76491b19b465bc479bf33338cfa48cfd5b1f8`.

Recover the copied arc-to-line rail in reverse with the existing independent line-to-arc oracle. Read the sketch roll at its authored start and project signed passage offsets onto the oracle's world axis. Report both physical mouths in authored travel order. Require both native charts at each cap edge and each of the twelve tangent joins.

- **PASS — original refusal.** Actual Studio displays the staged proposal. The local MCP image request returns `MODEL_REVIEW_REPLAY_FAILED` and the staged file stays byte-identical.
- **PASS — native proof.** Both terminal planes retain two separate four-edge apertures. Each aperture keeps its own tags, eight wall faces and four seam edges. The exterior supplies eight walls and four seam edges. All 12 shared edges and all 24 physical cap edges have both charts. Analytic volume is 1,325.3096491487338 mm³, native quadrature is 1,325.3096491487279 mm³, and analytic centroid is (8.489085304625327, 5.474589520244075, 0) mm. Maximum checked chart gap is 1.066e−14 mm.
- **PASS — actual desktop Studio WebGPU and local Agent.** Both orientations bind to native SHA-256 `25292709776f6d54b8c4ec4f4c082b88107ddcf01f69cc5fde03b6aff5bf2628`. The opposite orientation shows both mouths. Stale base, proposal and image pins refuse, as does a changed authored rail. Explicit Studio Accept, Save and fresh Open reproduce the body and both PNGs. Standard SHA-256 `34a025b82f60fd282bf1a4544a9a77bddd739a329f4b30359f9c08ad497b5eae`. Opposite SHA-256 `c003b30cf6ea6b4674d9993a99198cd1e85e24ddd5fdcf32b6c3d492af05c8e3`.
- **PASS — regressions and controls.** Seven new cases cover asymmetric openings, oblique 30°/120° carriers, radial sketch X/Y, reversal, resolved rounding bounds, signed passage ownership and each missing or shifted cap or join chart. Baseline, candidate and D1783/D1787 controls record 48 snapshots with unchanged sources and no page or console errors. Both controls retain their prior native body and image hashes. All 71 Model and 17 Studio tests pass. Scoped ESLint, Model types, Studio type check and production build, browser-driver syntax and Git diff check pass.
- **FAIL — corrected test oracle.** The first run passed 70 of 71 Model tests. The expected quarter-arc centroid counted a section moment twice (19/6 in place of 19/12). Independent integration corrected the test. The production code and tolerances were unchanged by this correction.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #324 stays open for the wider client and cost evaluation.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. On base sources replace `--review` with `--expect-review-unavailable` for the arc-first case.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-line-arc-duct-evidence paired-spaced-arc-duct-evidence paired-elbow-outlet-offset-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/pairedLineArcDuctEvidence.ts src/chat/rectangularDuctProposalReview.ts test/paired-line-arc-duct-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1801_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/arc-line" --arc-and-line --review
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-lead" --review
D1787_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-tail" --straight-tail --review
pnpm --dir apps/cad-studio build
git diff --check
```

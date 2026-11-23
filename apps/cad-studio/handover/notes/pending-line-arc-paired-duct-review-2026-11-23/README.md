# D1783 — Review the two passages of a pending straight-to-arc Sweep

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `0964736dca08fa4ed4a34b3f50472c7509b82eef`.

A pending D1782 Sweep can return standard and opposite four-view images and native inspection with the same proposal, source, body and image revisions. Validate both cap loops and each named wall group in the copied path frame. Associate four junction edges with each passage by its authored wall tags. Check the exact chart samples, shell topology, independent volume and centroid before returning the proof.

- **PASS, original refusal.** Existing Studio shows the staged solid in Preview without committing a body. The local Agent gives the proposal a review revision, then returns `MODEL_REVIEW_REPLAY_FAILED` when asked to render it. The pending file remains byte-identical.
- **PASS, native proof.** Both 2 × 2 mm mouths at each end have distinct cap edges and wall names. The 2 mm axial web remains. The closed genus-two shell has 26 faces. The outer walls and the two passage groups each have eight faces and four tangent joins. Independent volume is 1,325.3096491487338 mm³ and native quadrature gives 1,325.3096491487279 mm³. The independent centroid is (8.489085304625327, 5.474589520244075, 0) mm. Maximum chart gap is 1.066e−14 mm. The tests also cover unequal openings, tagged lane order, 30° and 120° default frames, retained rounded input within native tolerance, reversed seams, and refusal of invalid or mismatched native evidence.
- **PASS, desktop Studio and local Agent.** Preview does not change the part. The opposite view includes both ends. Independent native inspection reports the same requested cap and wall planes for both image revisions. A changed rail and stale base, proposal or image revisions refuse. Explicit Accept, Save and fresh Open keep body SHA-256 `115ae7defd86e6abe20056087f6e28ec8448c5819562df53fbf8a3664f5b61d9`. Both PNGs match byte-for-byte after approval and reopen. The standard PNG is `ade92f4cb32be037e25eca22f269db7872e851fb427207f4a78cff84f4782637`; the opposite PNG is `f3ca69f52b7f18345606493f83aff5a3cd64505db9f80c00458b5c555ffe6e34`. The two image files also match the earlier verified candidate after the tolerance adjustment.
- **PASS, controls and affected checks.** The single-opening line–arc review and the closed paired-cavity review each preserve two PNGs and six native volume and digest observations. The original, final and two control desktop runs cover 48 checkpoints. Final Studio runs have zero source changes, page errors or console errors. 74 Model and 17 Studio tests, scoped ESLint, Model type check, Studio production build and Git diff check pass.
- **FAIL, recovered development checks.** The first baseline assertion expected the review revision to be absent. The replay returns the revision and refuses during native evidence verification. The second baseline assertion expected an unavailable code. The corrected baseline checks the observed replay failure. A duplicate curve ID in the first reversed-seam test was corrected. The first type check found inferred test types for nested cap DTOs and a tuple. Explicit types and vertex ordering resolved them. The final lead and arc weight checks accept the demonstrated sub-tolerance rounding without changing the reference proof.
- **NOT_RUN.** Full local suites, full kernel suite, arbitrary frames, general Sweeps, alternate viewport backends, mobile and live providers. First mechanical CAD stays at 8/10 accepted. Overall completion remains unmeasured. Issue #324 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright. Set an external output directory distinct from the worktree. For the original refusal run the current paired driver on the base Model sources with `--expect-review-unavailable`.

```sh
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/paired-review" --review
D1748_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --line-and-arc --review --opposite-image
D1772_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/control-closed" --review-cavities
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-line-arc-duct-evidence closed-paired-rectangular-duct-evidence closed-rectangular-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review offset-rectangular-duct-intersection-evidence views saved-chamfer-resize-review corner-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

# D1787 — Review the two-ended paired duct before Agent approval

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `60a428ffcac63b2b9f87f1343809e77e09c4414c`.

Extend native pending Sweep review to the D1786 elbow with straight inlet and outlet spans. Tie both cap aperture groups to the authored wall tags, and expose two explicit junction groups. Bind both image orientations and native inspection to the same proposed body. Verify the centroid and volume against the copied rail and the independently integrated section.

- **PASS, original refusal reproduced.** Studio shows the pending preview without committing a body. The local Agent render returns `MODEL_REVIEW_REPLAY_FAILED` while the pending file remains byte-identical.
- **PASS, native proof.** The paired elbow has one closed genus-two shell, 38 native faces and two four-edge aperture loops per cap. The 10 mm lead and 14 mm tail meet an R20 quarter arc. Each passage owns 12 named walls and eight joins. The two junctions each have four exterior and eight interior edges with both charts. Independent volume is 1,773.3096491487338 mm³. Native quadrature gives 1,773.3096491487372 mm³. The independent centroid is (11.397144698540759, 10.912660586715687, 0) mm. Maximum chart gap is 1.066e−14 mm. Focused tests cover uneven passage dimensions, reordered lanes, changed tail geometry, wrong wall and chart attribution, reversed coedges, and exact copied path and revision checks.
- **PASS, actual desktop Studio WebGPU and local Agent.** Both four-view images use native body SHA-256 `b990430305f526bfb3edb29ad905110fcac1c4bbc10a049eb897672dafde9d40`. The opposite image shows both ends. Native inspection agrees for the two cap planes and six passage-wall planes in both orientations. Stale image, proposal, base and changed rail requests refuse. The pending file stays byte-identical during review. Explicit Accept, Save and fresh Open keep the same native body and two PNGs. Standard PNG SHA-256 is `b74a35974d8e847aa7aca7b866ddf37cd7a95e3492f1936b7790f28b125b4df3`. Opposite PNG SHA-256 is `00fb03e821f8bd29550be532ecee2d945fb862a499959c5ec15f1e9914b03848`.
- **PASS, controls and affected checks.** Both the paired straight-to-arc and closed-cavity controls retain their existing evidence, two PNGs, and six native observations each. Baseline, candidate and both controls cover 46 desktop checkpoints with zero source changes, page errors or console errors. 78 Model tests, 17 Studio tests, scoped ESLint, Model type check, Studio type and production build, and Git diff check pass. The first standalone type check was interrupted to release the heavy gate for Studio. The final type check ran to completion.
- **NOT_RUN.** Full local suites, full kernel suite, wider rail and section families, alternate viewport backends, mobile and live providers. First mechanical CAD stays at 8/10 accepted. Overall completion remains unmeasured. Issue #324 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output directories. On base Model sources, replace `--review` with `--expect-review-unavailable` on the elbow command.

```sh
D1787_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/paired-elbow-review" --straight-tail --review
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-paired-lead" --review
D1772_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/control-closed" --review-cavities
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-line-arc-duct-evidence closed-paired-rectangular-duct-evidence closed-rectangular-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review offset-rectangular-duct-intersection-evidence views saved-chamfer-resize-review corner-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

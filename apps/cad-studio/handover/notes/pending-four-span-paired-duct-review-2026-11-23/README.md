# D1811 — Review the pending four-span paired duct

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `34d449abc642246620ced3285f9f0e46e3087c89`.

Verify the original straight–arc–straight–arc Exact Sweep candidate before explicit Agent approval. The review recovers the authored rail in travel order and checks the physical native inlet, both mouths, all 48 wall faces and 36 charted internal edges.

- **PASS — original refusal reproduced.** Actual Studio opens the staged Sweep and its candidate preview. The local MCP image request returns `MODEL_REVIEW_REPLAY_FAILED` with the original staged bytes intact. The previous nine-pole dispatch only runs the closed-circle checker.
- **PASS — independent native geometry.** The 10 mm lead, two quarter arcs at R12/R18 and 8 mm spacer yield one genus-two shell. The two mouths are at (−10, 0, 0) and (−6, 38, 0) mm. All 36 internal edges and the 12 straight-inlet edges have paired surface charts. The revolved outlet has exact planar boundaries. The independent section and path integrals give 2083.9644737231006 mm³ and centroid (5.33630077103118, 16.88598994956946, 0) mm. Native quadrature gives 2083.964473723095 mm³ and agrees with the centroid. Maximum native gap is 1.1374233532693354e-14 mm. Focused cases cover different turn polarities, radial axes, aperture order, asymmetric edits and incorrect native paths, wall owners and charts.
- **PASS — actual Studio desktop Chrome WebGPU and local Agent.** Both Agent images use the same native body and authored rail. The opposite view shows both mouths and both pairs of openings. Candidate inspect returns the corresponding cap and lane planes. Stale part, proposal, image and changed-rail pins refuse. Studio preview preserves the proposal, and explicit Accept, Save and fresh Open reproduce the same native body and both PNGs.
- **PASS — affected checks.** 84 Model and 17 Studio tests, scoped ESLint, Model and Studio type checks, the Studio production build, browser driver syntax and Git diff check pass. The same-turn three-span and closed-circle desktop controls retain their previous native hashes. The three current runs contain 45 checkpoints, zero source changes and zero browser errors.
- **NOT_RUN.** General path and profile review, full local suites, alternate viewport backends, mobile, STEP and live providers. The first mechanical CAD baseline remains at 8/10 accepted. Overall CAD completion remains unmeasured. Issue #324 remains open for wider client and cost evaluation.

| Bound evidence | SHA-256 |
| --- | --- |
| Authored rail | `c0c086cfffe9026d85cdf2c2a48561335848ce5caf7f4dd949df5851c96f1efa` |
| Native candidate | `6725e37a71bd69c6db8b770746ce6011b1e58a93ffb319529278d2f3171ff2a2` |
| Standard PNG | `dd54038eeac4e8ee3b37dc861346eb7b6e8e91aac9ec3108bbed523bdc0abdcf` |
| Opposite PNG | `79df79a1ab6054ac8c0fd1e92f6e4c8b9d680693f4ec9aee44655551071f5845` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. On the base source, use the [D1810 fixture](../exact-four-span-paired-duct-sweep-2026-11-23/README.md) to stage a local Agent Sweep. Open Preview and request the image through the pinned proposal and current part revision. The base-only harness enables `--expect-review-unavailable` for `--lead-same-turn`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review paired-elbow-outlet-offset-evidence sweep-history-edit toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{pairedSpacedArcDuctEvidence,rectangularDuctProposalReview}.ts packages/barocss-cad-model/test/paired-spaced-arc-duct-evidence.test.ts apps/cad-studio/test/{exact-line-arc-paired-duct-browser,duct-proposal-review-browser-steps}.mjs
node --check apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
node --check apps/cad-studio/test/duct-proposal-review-browser-steps.mjs
D1811_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --lead-same-turn --review
D1796_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/three-span-control" --spaced-same-turn --review
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/closed-control"
pnpm --dir apps/cad-studio build
git diff --check
```

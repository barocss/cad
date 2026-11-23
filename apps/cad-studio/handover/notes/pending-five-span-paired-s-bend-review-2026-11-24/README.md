# D1820 — Show the pending Agent review for the five-span S-bend

P5 modeling and native reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `55145f29733e33fee8e548ce88ea1526d9df0157`.

The [D1819](../exact-five-span-paired-s-bend-2026-11-24/README.md) native Sweep already builds and accepts in Studio. The base pending image request returns `MODEL_REVIEW_REPLAY_FAILED` and preserves the proposal file. Add a native verifier for its exact stored eleven-point path and paired section.

- **PASS — independent native evidence.** The verifier reads the authored path, demands forward tangents and certifies separation of the two straight ends and nonadjacent bends. It requires both physical mouths, all 60 walls, four junctions with 48 paired internal edges, both charted terminal loops and consistent closed topology. The independent mass and centroid include the straight outlet. Tests refuse removal of any of 144 chart uses in scope, changed outlet geometry, wrong wall owners and mismatched native output.
- **PASS — local Agent and actual desktop Studio.** Both pending four-view images bind to the same source rail and native SHA-256 `f2a1809523c880f60f1dd5cefcaf530b103dea69c3404d13a5798c3b7afd0c2b`. They show the two opposite physical mouths. Linked inspections identify the source cap and aperture walls in the same body. The wrong image, proposal or base revision refuses. A changed rail invalidates the old read pin. Preview preserves the pending file and explicit Accept followed by Save and fresh Open reproduces the body and both images.
- **PASS — affected checks.** 85 Model, 26 Studio, both types, scoped ESLint, production build and browser driver syntax. The new and four-span control runs have 35 desktop checkpoints and no source changes or browser errors. Both four-span images are byte-identical to D1814 and its native body hash is unchanged.
- **FAIL — reproduced before the fix.** The D1819 source accepts the Sweep but cannot prove the pending native review. The candidate produces both images and the scoped inspections.
- **NOT_RUN.** Full local suites, alternate browser backends, STEP, live providers and broader review clients or cost measurements. #324 stays open at that wider scope. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

| Review artifact | SHA-256 |
| --- | --- |
| Original orientation | `ea4ba9ec058fea4eaea02f69a9160b7e60e8820781df05fda5cd97fe4b78748a` |
| Opposite orientation | `bba6e563030d9bf27fee8b5518dd17ce3a66c05949b0bbc9ee5a734ae702bd15` |
| Copied rail | `745873104c647cbcd7c62114586de3ff8994af263b08b7b7ea9e3ddb735f1b36` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output. On D1819 run the five-span driver with `--expect-review-unavailable` under its original `D1819_SOURCE_FROZEN` setting. Use the current setting for the fixed route.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence rectangular-duct-proposal-review sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test proposal-review-availability sweep-path-geometry sweep-path-feedback edge-continuity-scope command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{pairedSpacedArcDuctEvidence,rectangularDuctProposalReview}.ts packages/barocss-cad-model/test/{paired-spaced-arc-duct-evidence,rectangular-duct-proposal-review}.test.ts apps/cad-studio/test/{duct-proposal-review-browser-steps,exact-line-arc-paired-duct-browser}.mjs
node --check apps/cad-studio/test/duct-proposal-review-browser-steps.mjs
node --check apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
pnpm --dir apps/cad-studio build
D1820_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --lead-outlet --review
D1814_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control" --lead-opposite --review
git diff --check
```

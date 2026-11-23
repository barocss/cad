# D1851 — Repeat the first of three cuts on a rectangular grid

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `b025b743457cf52e204cf8139ba61802be381c17`.

Rectangular cut pattern can repeat the first rectangular through-cut after two later cuts on the same stock. It reuses the Linear proof for all three original cavities. The first cut owns the grid cells, and the third remains the target. Both axis inputs use X or Y for the earlier source. The no-source pattern still offers Z and follows the current cut. The existing saved source and target fields carry the edit.

- **PASS, native and Model.** X16 × Y8 with counts 2 × 2 makes six apertures in 60 × 40 × 10 mm stock. Independent geometry gives one genus-six shell, 30 faces, 84 edges, 56 vertices, 23,480 mm³ and centroid `(709400/23480, 471880/23480, 5)`. Exact aperture locations and wall IDs distinguish the copied first tool from both retained tools. Both XY orders, count-one axes, individual tool/spacing edits, explicit revision-bound commands and fresh reader replay pass.
- **PASS, desktop Studio.** Browser and History create the same part and keep the first source. Y18 and X32 each collide with a different later cut and keep the accepted document and Undo label. The constant six-hole count remains when X16 changes to X18. Undo, Redo, Save and fresh Open retain that edit and the source. The current-tool, direct-earlier Rectangular, three-cut Linear and farther Path refusal controls pass. Four runs capture 32 states with zero source changes, page errors or console errors.
- **PASS, affected checks.** 60 Kernel, 49 Model and 9 Studio tests. Kernel library build, Kernel/Model/Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check pass.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Whole local suites, previous reader execution, mobile, other renderers and live providers. Fill and Path still require their direct earlier source. #25 remains open. First mechanical CAD remains 8/10 and whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-linear-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1851_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --rectangular-three
D1828_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/direct-rectangular"
D1850_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/three-linear" --linear-three
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/farther-path-refusal"
git diff --check
```

# D1852 — Repeat the first of three cuts through a captured Fill mask

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `7643891476a1336d9fc81704268c3f9bab012d10`.

Fill cut pattern can retain the first of three same-stock rectangular through-cuts as its source. The current third Difference still owns the target. The existing Fill planner captures the inline mask and supplies only its actual selected cells to the shared three-cavity native proof.

An L mask selects centres (26, 9) and (10, 17) mm and omits (26, 17). The result retains the three original holes. The user can still change spacing in History. This re-evaluates the same captured mask.

- **PASS, native and Model.** Two copies make five through apertures in 60 × 40 × 10 mm stock. The strict result has genus five, 26 faces, 72 edges and 48 vertices. Independent coordinates and moments give 23,560 mm³ and centroid `(711480/23560, 473240/23560, 5)`. Mask holes, no extra cells and an unsafe excluded diagonal preserve the correct native cavity set. The revision-bound local command accepts the exact source and refuses both actual selected collisions.
- **PASS, actual desktop Studio.** Browser and History produce identical features. Y18 hits the second original hole and X32 hits the third. Apply stays disabled and the old document and Undo label remain. The valid edit changes Y8 to Y5 and moves one copy. Undo, Redo, native Save and fresh Open retain the original source, third target and captured mask. Default current-cutter, direct earlier Fill and farther Path refusal controls pass. Three runs capture 23 states with no source changes, page errors or console errors.
- **PASS, affected checks.** 63 Kernel, 49 Model and 9 Studio tests. Kernel library build, Kernel/Model/Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check pass.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Whole local suites, previous reader execution, mobile, other renderers and live providers. Path still requires the direct earlier source. #25 stays open. First mechanical CAD remains 8/10 and whole-product completion stays unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-linear-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1852_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --fill-three
D1831_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/direct-fill" --fill
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/farther-path-refusal"
git diff --check
```

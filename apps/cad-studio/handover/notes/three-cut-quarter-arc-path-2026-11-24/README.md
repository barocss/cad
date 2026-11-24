# D1872 — Repeat an earlier rectangular cut along one quarter arc

P1 [row 03](../../roadmap-rows/03.md), [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `c2496f023b95dd4cbce99c873534c3037cb82852`. Public geometry qualification.

The shared Path CUT planner admits one canonical axis-aligned XY quarter arc. The original degree, poles, knots and weights identify the native representation exactly. Equal nonzero pole deltas on perpendicular world axes and a common Z establish the circle. A plan encloses total path length and checks each fixed-orientation offset against the existing linear policy. The plan refuses an uncertified endpoint. Native earlier-source clearance still tests the exact rounded offsets against the stock, both intervening cuts and all the copies.

- **FAIL, original desktop Studio.** A 20 mm-radius quarter arc from Centre arc and Make curves had the expected three poles and weights. The Path selector omitted it and Apply was disabled.
- **PASS, Chrome desktop.** Choose the earlier cut from both Browser and History. At 10 mm spacing the selected cut adds two copies with fixed orientation. A current-cut control uses the same authored path. 17 mm spacing for two intervals refuses before Apply and preserves the document and History. History changes the earlier-cut spacing to 12 mm. Undo, Redo, native Save and fresh Open retain the original cut source and the Direct curve link. The polynomial-quadratic control passes. The original and two final desktop runs capture 19 states with no page errors or changed sources.
- **PASS, independent native geometry.** The two 10 mm offset positions are `(9.5885107721, 2.4483487622)` and `(16.8294196962, 9.1939538826)` mm. Decimal integration of the actual saved binary64 rational curve gives length `31.415926535897933` mm inside the planner interval `[31.41592653589764, 31.415926535898222]` mm. The two position deviations are below `1.83e-12` mm. The output has 26 faces, genus five and volume `23560` mm³. All 12 original aperture planes and bounds compare exactly before and after both accepted spacings. A copy that overlaps each newer aperture separately is refused and the accepted native file bytes remain identical.
- **PASS, numerical review and affected checks.** Two Sol High source audits. The original weight perturbation reserves `64R × 2^-52` mm. The fixed-point bound reserves 256 units at `2^-62` for the argument, Taylor truncation and term rounding. Final conversion is checked within half the linear tolerance per coordinate. Kernel 84, Model 31, Studio 9, Kernel build and types, Model and Studio types, Studio production build, scoped lint and syntax. Tests catch in-memory removal of the quarter dispatch, equal-radii constraint and endpoint-certification refusal.
- **NOT_RUN.** General rational curves, other arc domains or orientations, compound arcs, farther ancestor cuts, other renderers, mobile and full local suites. No new file field or schema change. #25 remains open for its wider acceptance. First mechanical CAD stays 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path,quadratic}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test quadratic-feature-pattern api-curve-feature-pattern prior-feature-pattern prior-rectangular prior-path tool-contract toolset
pnpm --dir apps/cad-studio test model-rail candidate-references command-build-failure
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1872_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/baseline" --quarter --baseline
D1872_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/quarter" --quarter
D1862_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/quadratic-control" --quadratic
git diff --check
```

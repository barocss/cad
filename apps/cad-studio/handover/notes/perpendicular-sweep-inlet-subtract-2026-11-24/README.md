# D1919 — Preserve circular Sweep joints through an inlet Subtract

P5 [row 07](../../roadmap-rows/07.md), [row 08](../../roadmap-rows/08.md) and [row 30](../../roadmap-rows/30.md), [#10](https://github.com/barocss/cad/issues/10). Base `c02d4c6078d537efd1929bb9745f58181319891b`.

Keep the existing exact Difference result. For one original exact Sweep and an original zero-draft rectangular prism, retain the untouched circular joint bindings after verifying each complete original curve, the directed reciprocal uses and the current chart boundary. Verify every matching native cylinder and torus carrier. A single-part translation of the proven cutter retains that authority.

- **FAIL, previous desktop Studio.** The public Box and Subtract commands trimmed the straight inlet by 3 mm. The new annular cap and strict genus-1 solid had the correct 604.353423382101 mm³ volume. The twelve untouched circular edges lost both pcurves. Studio reported a missing native parameter curve.
- **PASS, current desktop Studio.** Create the cutter, Subtract, edit its width from 5 to 6 mm in History, Undo, Redo, Save and fresh Open. The original straight inlet starts at X−7 or X−6 mm after the respective cut. All original twelve edges retain both pcurves. Studio measures 0° on each after fresh Open. The six new desktop checkpoints and eleven prior rectangular-duct control checkpoints pass.
- **PASS, independent physical checks.** The exact volumes are 604.353423382101 and 594.9286454213317 mm³, against `3π(15π + 17)` and `3π(15π + 16)`. Both caps have radius 2 and radius 1 boundary rings. Their normals and planes match the closed solid. Samples on all eight original bend surfaces match their independent torus equations. The largest pcurve gap is 3.98e−15 mm. Native disjoint and tangent controls keep all twelve original joins. At X0 the four original cylinder/bend joins give way to a new cap. Only the eight surviving joins retain their bindings.
- **PASS, affected checks.** 19 focused native, 12 Model and 11 Studio tests. Kernel and Model type checks, scoped lint, Studio production build, driver syntax and Git diff check pass. Native negatives distinguish an unqualified cutter, a changed torus with the same circular boundary and a cylinder with reversed material orientation.
- **FAIL, earlier test revisions.** The test first compared raw surface digests across the Boolean rebuild, which can regenerate native chart IDs. It now uses world-space equations. The first fixed Studio flow then looked for the cutter's internal sketch row. The public History exposes the box feature and edits its Width from there.
- **NOT_RUN.** All local suites, other Boolean operations and cutter families, direct face replacement or offset, arbitrary frame laws, mobile and paid providers. The first mechanical CAD baseline remains 8/10. Overall completion remains unmeasured. #10 stays open.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-perpendicular-sweep-inlet-subtract,exact-perpendicular-bore-fillet,exact-spaced-bore-fillet}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display edge-continuity sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry edge-continuity-scope continuity-angle-label
D1919_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-subtract-browser.mjs "$OUT/baseline" --baseline
D1919_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-subtract-browser.mjs "$OUT/studio"
D1739_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs "$OUT/rectangular-control" --spaced-opposite
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

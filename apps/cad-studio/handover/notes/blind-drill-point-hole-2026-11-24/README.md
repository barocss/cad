# D1913 — Add a blind Hole with a fixed 118° drill point

P1/P5 [row 07](../../roadmap-rows/07.md) and [row 16](../../roadmap-rows/16.md), [#746](https://github.com/barocss/cad/issues/746). Base `46065e6d3f28154cadbcfa21fb663cd9e525270e`.

Use **Hole → Blind with 118° drill point** on the original +Z face of one upright rectangular extrusion. Cylindrical depth ends at the cylinder–cone junction. Total depth includes the conical point. The native evaluator checks the whole circular rim and tip clearance before applying one exact Revolve cutter. The model saves the distinct `blind-drill-hole` feature in the existing format. Earlier Studio explicitly refuses that feature. Existing flat, through and tapped Hole recipes keep their prior meaning. This scope accepts one hole and a fixed point angle.

- **PASS, independent native oracle.** Ø8 and cylindrical depth 9 mm give point height 2.4034424761102424 mm and remove 492.659407323723 mm³ from 32 × 24 × 20 mm stock. The result is 14,867.340592676277 mm³ and one strict genus-0 shell. The cylindrical half-walls and the two rational cone half-surfaces share the same exact radius-4 rim. There is one apex at Z8.596557523889757. The original floor of the stock remains a plane with one outer loop. The separate flat-floor control removes 452.389342116930 mm³.
- **PASS, desktop Studio.** Seven actual scenes include the exact X16 sections at the same diameter and depth, total-depth preview, History edit, native fresh Open and the thin-stock comparison. At 11 mm thickness the point refuses without changing the document or History. Cancel retains the stock. The existing flat-floor Hole still succeeds with 2 mm material below the floor. History changes the 20 mm stock’s cylinder depth from 9 to 8 mm, total depth from 11.403 to 10.403 mm, and native volume to 14,917.606075133726 mm³. Undo/Redo and fresh native Open retain the agreed geometry. Seven actual legacy Through/To a depth control scenes also pass.
- **PASS, persistence and affected checks.** Four focused Kernel, two Model and six Studio tests pass. Kernel and Model type checks, focused lint, Studio production build, driver syntax and Git diff check pass. A scratch reader compiled from the immutable base accepts the old flat Hole and explicitly rejects the actual new saved feature. The schema number is unchanged.
- **FAIL, retained baseline.** The larger native Part suite passed 50 of 51. Its out-of-scope Sweep error-message assertion also fails when the same test is run against a scratch build of the clean base. The first new Model run hit eager module initialization through the existing document cycle. Accessing node extras only during validation corrected that failure. The first browser attempts used the default Extrude locator and then double-clicked the selected thin-stock face after Cancel. The corrected driver uses the Hole dialog and reuses the selected face for the flat control.
- **NOT_RUN.** Whole local suites, drill point patterns, other faces, tapped or countersink combinations, user-defined angles, broader STEP/native cone transfers, mobile and PDF. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured.

```sh
node --test --test-concurrency=1 packages/barocss-cad/test/blind-drill-hole.test.mjs packages/barocss-cad/test/part-model.test.mjs
pnpm --dir packages/barocss-cad-model test blind-drill-hole
pnpm --dir apps/cad-studio test blind-hole-history-input countersink-history-input
pnpm --dir apps/cad-studio build
D1913_SOURCE_FROZEN=1 node apps/cad-studio/test/blind-drill-hole-browser.mjs "$OUT/studio"
HOLE_END_HISTORY_SOURCE_FROZEN=1 node apps/cad-studio/test/hole-end-history-browser.mjs "$OUT/flat-control"
git diff --check
```

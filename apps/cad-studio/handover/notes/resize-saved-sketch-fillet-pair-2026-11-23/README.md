# D1726 — Resize two saved sketch Fillets in one edit

P1 Sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `9dedfabf44d120489b33209a49bfec003249f2de`.

Select saved orthogonal Fillet arcs with the same starting radius on one independent outline. The existing corner editor offers Edit Fillets. The input and the handle on the first selected arc share one draft. Validate each selected arc, then check the final profile and parameter bindings. Apply the complete draft in one sketch history step.

## Verification

- **FAIL, base capability.** Desktop Studio creates the adjacent convex/reflex pair, finishes the sketch and selects both saved arcs again. No shared Fillet editor or radius handle is available. The source remains unchanged.
- **PASS, desktop Studio WebGPU.** With both saved R6 arcs selected, refuse R13 on the shared 25 mm carrier and retain both original arcs and coordinates. Numeric R8 and a real drag of the first arc midpoint to R8 produce identical previews. Cancel retains both R6 arcs. One Apply updates both arcs. One Undo and Redo restore both radii in the sketch and in document History after Finish. Save and fresh Open retain both R8 arcs. Select both again to reopen Edit Fillets. Nine checkpoints report no page errors, console errors or source changes.
- **PASS, independent native geometry.** The 10 mm Extrude has one valid closed solid, 12 faces and both original side IDs. The convex and reflex cylinder radii are both `8.000000000000002 mm`. The 25 mm carrier between the original corners retains a 9 mm straight segment. The convex removal and reflex addition cancel, so the analytic volume is `20000 mm³` and the native volume is `20000.00000000002 mm³`. Both cylinder orientations, all straight wall endpoints, the fixed anchor, tangent turns, constrained width and feature output associations persist. Reopened native hash `35d8d87a5824c6461f7eee72212fd455ff41367f90ae5b6e873035b4a10164a4`.
- **PASS, controls and affected checks.** 12 Model and 53 Studio tests. Scoped ESLint, Studio production build and types, driver syntax and Git diff check. Actual Studio retains the previous single Fillet and Chamfer handles and the batch creation flow.
- **Known diagnostic.** The base sketch reports two redundant constraints after the original batch creation. The same diagnostic stays visible after resize. The independent native and saved-document comparisons pass.
- **NOT_RUN.** Full local suites, mixed starting radii, grouped Chamfer resizing, other sketch varieties, WebGL2, mobile and local Agent resize of a group. The first mechanical CAD baseline remains 8/10. Overall completion remains unmeasured. Issue #21 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1726_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/pair" --resize-fillets
D1718_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/single-fillet" --radius-drag
D1719_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/single-chamfer" --resize-drag
D1695_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/create-corners"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-fillet-edit sketch-chamfer-edit sketch-corner-batch
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test constraint-list constraints draft-sketch-history sketch-presentation
pnpm exec eslint apps/cad-studio/src/{sketch/{cornerDraft,constraintInspection}.ts,ui/{ConstraintTools,SketchCornerTools}.tsx,viewport/SketchCornerSizeHandle.tsx} apps/cad-studio/test/sketch-corner-batch-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-corner-batch-browser.mjs
git diff --check
```

# D1728 — Resize two saved sketch Chamfers in one edit

P1 Sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `4c91bb4fba5c73a482f10e0d141379c56baedc24`.

Select saved orthogonal equal-setback Chamfers on one independent outline. Edit Chamfers uses the shared draft from D1726, the existing Chamfer setback handle and the existing per-bevel validation. Apply updates all selected bevels in one history step after the full profile and parameter bindings pass.

## Verification

- **FAIL, base capability.** Desktop Studio creates the convex and reflex C6 pair and finishes the sketch. Selecting both saved bevels offers no shared editor or handle. The document stays unchanged.
- **PASS, desktop Studio WebGPU.** The C13 edit would consume a shared 25 mm carrier. Studio disables Apply and retains both C6 bevels and the original coordinates. The C8 input and a real drag from the first bevel midpoint produce the same preview, and Cancel keeps both C6 bevels. Apply changes them together. One Undo and Redo work in both the sketch draft and accepted document history. Save and fresh Open retain both C8 bevels. Select them again to reopen Edit Chamfers at 8 mm. All nine checkpoints have zero page errors, console errors and frozen source changes.
- **PASS, independent native geometry.** Both planar bevel walls retain the original side IDs. Their endpoint setbacks are 8 mm, the two diagonals are 8 × √2 mm, and the shared straight carrier measures 9 mm. The fixed anchor, angle locks and unrelated wall endpoints persist. One strict 12-face Extrude has an independent volume of 20,000 mm³ and a native volume of 20,000.000000000007 mm³. Convex removal and reflex addition cancel in this fixture. The reopened B-rep hash is `dd98e0ed9cbae3979de376209c6ed0d9baf02304d8644ca4aff021d185f31e64`.
- **PASS, controls and affected checks.** 19 Model tests and 53 Studio tests. Scoped ESLint, Studio production build and types, driver syntax and Git diff check. Actual desktop confirms the previous single Chamfer handle and saved Fillet pair.
- **Known diagnostic.** The original batch-created outline shows two redundant constraints. The diagnostic stays visible after the shared Chamfer resize. Native and saved-document checks pass.
- **NOT_RUN.** Full local suites, mixed starting sizes, other profile families, local Agent group resize, WebGL2, mobile and live providers. The first mechanical CAD baseline remains 8/10. Overall completion remains unmeasured. Issue #21 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1728_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/pair" --resize-chamfers
D1726_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/fillet-pair" --resize-fillets
D1719_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/single-chamfer" --resize-drag
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-chamfer-edit sketch-chamfer-retention sketch-fillet-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test constraint-list constraints draft-sketch-history sketch-presentation
pnpm exec eslint apps/cad-studio/src/{sketch/cornerDraft.ts,ui/SketchCornerTools.tsx} apps/cad-studio/test/sketch-corner-batch-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-corner-batch-browser.mjs
git diff --check
```

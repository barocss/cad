# D1844 — Refine the exact shaft rims in Studio

P4 [row 06](../../roadmap-rows/06.md) and P2 [row 13](../../roadmap-rows/13.md), [#16](https://github.com/barocss/cad/issues/16). Base `f574935256de5c325ee80230ab89cb0f20f7218b`.

The D1843 native and anonymous STEP shafts have exact cylindrical supports. Their default 32-chord rim outlines cause visible corners. Studio now reuses the existing cylindrical display tiers for that two-step profile. The shaft's full radius and axial span bound the perspective scale. Each finer mesh must retain that body's own canonical face and edge tables. The native and anonymous STEP owner tables remain distinct. The packet falls back to the ordinary mesh if its geometry, owner check or size fails.

The optional packet does not change the native B-rep, mass, authored file or canonical topology. The original STEP must match the submitted raw geometry before Studio uses the finer packet. A damaged LINE carrier that ordinary STEP Open normalizes still displays through the standard path and gets no refined packet.

- **PASS, WebGPU and WebGL2.** Open the native and anonymous STEP fixtures in actual Chrome and keep the normal angled Model view. At this camera, 361 analytic samples on each rim give maximum projected line error 0.675501 → 0.042577 CSS px on the top rim and 1.095833 → 0.067982 CSS px on the shoulder rim. Both backends upload 128 instead of 32 chords per full circle.
- **PASS, selection and native geometry.** Actual clicks select native display indices 3 and 1 and anonymous STEP indices 6 and 2. The native circles use grouped half edges. The anonymous file keeps the two original half-edge owners per rim. The same canonical bodies, names and edge tables back the selected indices at each quality. Strict B-rep and volume 4674.689868542 mm³ agree for both files. Each refinement adds two packets of 41,760 and 82,720 bytes, below the shared 192 KiB budget.
- **PASS, affected checks.** 15 Model and 33 Studio focused tests. Model types, Studio types and production build, scoped ESLint and Git diff check. Two final Chrome runs give eight screenshot states and freeze 1,206 files per run with zero page, console and source-change errors. Focused tests also cover the two diameter orders and reject a corrupted STEP carrier.
- **FAIL, initial unit assertion.** Fresh snapshots do not guarantee B-rep object identity. The final check uses exact structural equality for the native geometry.
- **NOT_RUN.** Arbitrary shaft geometry, unsupported STEP representations, unlimited zoom, other viewport modes, mobile and full local suites. The measurement compares the projected analytic rims with the active line segments. #16 stays open for wider exchange work. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
D1844_SOURCE_FROZEN=1 node apps/cad-studio/test/shaft-rim-display-browser.mjs "$OUT/webgpu" "$D1843_SHAFT"
D1844_SOURCE_FROZEN=1 node apps/cad-studio/test/shaft-rim-display-browser.mjs "$OUT/webgl2" "$D1843_SHAFT" --webgl2
node packages/barocss-cad-model/scripts/test.mjs shaft-display cylinder-display editable-step-copy
pnpm --dir apps/cad-studio test display-mode viewport editable-step-preparation
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

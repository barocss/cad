# D1778 — Verify adjacent right and oblique Sketch Chamfers

P1 Sketch workflow, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `5a97be3a7d49d660603637f6d8dab505b4823fd1`.

Qualify one equal-setback Chamfer on the adjacent right and 143.130102354156° corners of the D1766 fixture. The corners share a 30 mm straight side. The source has one pre-existing redundant constraint. Add the repeatable desktop qualification to the existing adjacent-corner driver.

- **PASS, actual desktop Studio WebGPU.** Select both corner points and request D16. The shared side would have −2 mm left. Studio disables Apply and preserves the original outline and document. D6 previews and applies both Chamfers in one action. Undo, Redo, Save and fresh Open reproduce the accepted part.
- **PASS, selection and local Agent.** Select the same corners by their three straight sides. The local Agent discovers the same stable pairs, refuses D16 without writing, dry runs D6 and stages one proposal. Explicit Studio approval reproduces the manual edit and the reopened body.
- **PASS, independent geometry.** The contact pairs are `[0,6], [6,0]` and `[24,0], [34.8,3.6]` mm. The shared straight e1 retains 18 mm. The native bevels have the expected planar normals and lengths 8.485281374239 and 11.384199576606 mm. The original carrier angle is preserved by its 36.869897645844° separated rule. The bevel joint angles are 135° and 161.565051177078°. The two removed areas total 28.8 mm². The independent 10 mm extrusion gives 20,712 mm³ and native volume is 20,712.000000000004 mm³.
- **PASS, affected checks and controls.** 57 Model tests, scoped ESLint, browser driver syntax and Git diff check. 33 Studio checkpoints have zero source, page or console errors. The four accepted Chamfer paths share the same body digest. Five native records match across both Chamfer runs, including the sharp control. Five prior Fillet native records match D1766 byte for byte.
- **FAIL.** None in the selected checks.
- **NOT_RUN.** Full local suites and production build for this driver-only delivery, later group setback editing, arbitrary corner groups, alternate GPU backends, mobile and live providers. Issue #21 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

Native B-rep SHA-256 for D6 is `166cca3905877aefc57add6da944a6920b1107cc360c0f366d8dda7ee08d5b0c`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories.

```sh
D1778_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs "$OUT/final" --chamfer
D1766_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs "$OUT/fillet-control"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-chamfer-edit sketch-chamfer-retention
pnpm exec eslint apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs
node --check apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs
git diff --check
```

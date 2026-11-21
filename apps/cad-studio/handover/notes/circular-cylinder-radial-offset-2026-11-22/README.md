# D1592 — Offset the wall of a circular cylinder

P5, row 31, [#629](https://github.com/barocss/cad/issues/629) and [#17](https://github.com/barocss/cad/issues/17). Base `8950a503f8761c3cc1de5eb8b4039f200e301182`.

Select the outer wall of an original upright circular extrusion and enter a signed Offset distance. The kernel proves that the two native half-cylinder faces form one complete wall. It changes their common radius and extends both cap trims in their existing planes. The feature stores one exact wall signature in the existing Offset recipe. History edits the signed distance.

- **PASS, desktop Studio WebGPU.** Click the wall of a 20 mm tall solid with radius 5 mm and axis at X 7 mm and Y −4 mm. Preview and apply +2 mm. History refuses −5 mm at the original radius and retains the accepted +2 mm document. Then apply −1 mm, Undo, Redo, Save and open in a fresh desktop context. The reopened native B-rep matches the accepted result exactly.
- **PASS, native geometry.** Both cylindrical faces reach radii 7 mm and 4 mm for the two accepted distances. The caps remain at Z 0 and 20 mm. The axis, four faces, six edges, four vertices, owner identities and UV trims match the original. The maximum Studio trim gap is 1.84e−15 mm. The independent volumes `π × 7² × 20` and `π × 4² × 20` are 3078.7608005179973 and 1005.3096491487338 mm³. Native differences are below 7e−12 mm³.
- **PASS, focused regression.** Six Kernel cases cover both signed distances, either wall patch, displaced axes, analytic support checks and rejection outside the proven family. 109 Model and 41 Studio tests, Kernel and Model types, scoped lint, Studio build, browser syntax and Git diff pass. The successful Studio run reports zero runtime errors, console errors and source changes.
- **FAIL, initial checks corrected.** The initial Model Save/Open check found a signed zero in the rounded wall signature. Normalize the stored coordinate. Lint caught an unused test binding. The first browser driver could not resolve its mistyped Model import. The next driver observed the correct cylinder-axis refusal but expected different words. The final driver uses the actual refusal text and passes.
- **NOT_RUN.** Tilted cylinders, bores, split walls, repeated radial offsets, pointer dragging, a new MCP flow, other renderers, neutral exchange, mobile and full local suites. #629 and #17 remain open.

Use Node 22.19.0, installed desktop Chrome and Playwright. Gate heavy checks and keep captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/circular-wall-offset.test.mjs
pnpm --dir packages/barocss-cad-model test offset-face-native native-offset-face native-offset-circle-browser native-offset-result rematch references
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/bored-cap-offset.ts packages/barocss-cad/src/part/part-model.ts packages/barocss-cad/test/circular-wall-offset.test.mjs packages/barocss-cad-model/src/app/{nativeOffsetFace,offsetFaceEdit,profileCommands}.ts packages/barocss-cad-model/src/engine/{doc,references,rematch}.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/circular-wall-offset-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply offset-face-launch-view
pnpm --dir apps/cad-studio build
CIRCULAR_WALL_FROZEN=1 node apps/cad-studio/test/circular-wall-offset-browser.mjs "$EVIDENCE"
node --check apps/cad-studio/test/circular-wall-offset-browser.mjs
git diff --check
```

# D1593 — Offset the wall of a through bore

P5, row 31, [#629](https://github.com/barocss/cad/issues/629) and [#17](https://github.com/barocss/cad/issues/17). Base `a363001c8fc13e138322a671735259df93f5a4ff`.

Select the inner wall of one original through bore in an upright rectangular plate. Signed Offset follows the normal out of the solid material. A positive distance reduces the bore radius. A negative distance enlarges it. The operation moves both native wall patches and recomputes the inner cap trim controls on the original cap supports.

- **PASS, desktop Studio WebGPU.** Pick the inner wall of a radius 3 mm bore at X 11 mm and Y 9 mm in a 40 × 30 × 10 mm plate. Apply +1 mm for radius 2 mm. History refuses +3 mm at the bore axis and −6 mm at the nearest outer wall, preserving the accepted document. Apply −2 mm for radius 5 mm and verify Undo, Redo, Save and fresh Open.
- **PASS, native geometry.** The original outer faces and both cap supports match exactly. The axis remains fixed, both cap inner rims stay bound to the new cylindrical wall, and all 8 face, 18 edge, 12 vertex and trim identities remain. Fresh Open matches the accepted native result. The maximum observed pcurve gap is 3.98e−15 mm. The independent expression `(40 × 30 − πr²) × 10` gives 11874.33629385641 and 11214.601836602551 mm³. The two edited volumes agree within 2.2e−11 mm³.
- **PASS, affected checks.** 11 Kernel checks cover the new bore and prior cylinder. They check both native half selections, both signed distances, independent volume and centroid, restored cap admission and refused invalid families. 110 Model and 41 Studio tests, Kernel and Model types, scoped lint, Studio build, browser syntax and Git diff pass. The final desktop receipt records zero runtime errors, console errors or frozen source changes.
- **FAIL, initial lint.** The new Kernel test included one unused destructured binding. The corrected test passes lint and the focused suite.
- **NOT_RUN.** Other plate profiles, multiple bores, blind or tilted bores, repeat radial features, pointer dragging, a new MCP flow, other renderers, neutral exchange, mobile and full local suites. #629 and #17 remain open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate heavy checks and store captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{circular-wall-offset,bore-wall-offset}.test.mjs
pnpm --dir packages/barocss-cad-model test offset-face-native native-offset-face native-offset-circle-browser native-offset-result rematch references
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/bored-cap-offset.ts packages/barocss-cad/src/part/part-model.ts packages/barocss-cad/test/{circular-wall-offset,bore-wall-offset}.test.mjs packages/barocss-cad-model/src/app/{nativeOffsetFace,offsetFaceEdit,profileCommands}.ts packages/barocss-cad-model/src/engine/{doc,references,rematch}.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/circular-wall-offset-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply offset-face-launch-view
pnpm --dir apps/cad-studio build
CIRCULAR_WALL_FROZEN=1 node apps/cad-studio/test/circular-wall-offset-browser.mjs "$EVIDENCE" --bore
node --check apps/cad-studio/test/circular-wall-offset-browser.mjs
git diff --check
```

# D1603 — Offset the outside wall of an upright coaxial tube

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `8d56bcf6989ae3391863dac1c71ccd68c66ed2b8`.

Offset face now resizes one supported coaxial tube from its outside cylindrical wall. A positive distance increases the outside radius, and a negative distance reduces it. The Kernel changes the outside boundary and refits the cap charts to their existing planes. Both inner trims use their original world-space curves. The cap pcurves use the new UV chart with the same native owners. The complete bore, its boundary and all native IDs stay fixed.

- **FAIL, base capability.** The previous Studio admission check exposes only the inner wall on a tube. The D1597 Model test explicitly verifies the outer selection refusal at that checkpoint.
- **PASS, desktop Studio WebGPU.** Pick the outside wall of the 18 mm OD, 8 mm ID, 16 mm-high tube. Apply +2 mm for an outside radius of 11 mm. History labels the original outer wall correctly and refuses −5 mm where the outside reaches the bore. The accepted part stays intact. Apply −1 mm for R8. Undo, Redo, Save and fresh Open preserve the exact resulting B-rep. The existing inner wall flow also passes in actual Studio.
- **PASS, independent geometry.** The bore remains R4 at the original (14, 9) mm axis. The two bore faces, their six edges, four vertices and wall coedges match their original native records. The cap planes stay at Z0 and Z16. The volume π × (R² − 16) × 16 mm³ agrees with native values 3267.256359733384, 5277.875658030849 and 2412.7431579569507 mm³ at R9, R11 and R8. Maximum volume error is below 2e−11 mm³. Maximum trim gap is 5.03e−15 mm. Native owner records and the six-face closed topology survive each change. Kernel regression covers both selected halves, signed edits, eccentric and contact refusals and stored-direction pcurves.
- **PASS, affected checks.** 79 Kernel, 117 Model and 41 Studio tests, Kernel and Model types, Studio types and production build, scoped lint, browser syntax and Git diff. The outer wall flow covered 1161 frozen files with zero changed files, runtime errors and console errors.
- **NOT_RUN.** Offset chains, eccentric or tilted tubes as supported edits, exchange, new stdio MCP, other renderers, mobile and full local suites. #629 remains open.

Use Node 22.19.0, installed Chrome and Playwright. Gate each run and keep captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{circular-wall-offset,bore-wall-offset,bored-cap-offset}.test.mjs
pnpm --dir packages/barocss-cad-model test offset-face-native native-offset-face native-offset-circle-browser native-offset-result rematch references cylinder-display
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/bored-cap-offset.ts packages/barocss-cad/test/{circular-wall-offset,bore-wall-offset}.test.mjs packages/barocss-cad-model/src/app/{nativeOffsetFace,offsetFaceEdit,profileCommands}.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/circular-wall-offset-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply offset-face-launch-view
pnpm --dir apps/cad-studio build
CIRCULAR_WALL_FROZEN=1 node apps/cad-studio/test/circular-wall-offset-browser.mjs "$EVIDENCE/outer" --tube-outer
CIRCULAR_WALL_FROZEN=1 node apps/cad-studio/test/circular-wall-offset-browser.mjs "$EVIDENCE/inner" --tube
node --check apps/cad-studio/test/circular-wall-offset-browser.mjs
git diff --check
```

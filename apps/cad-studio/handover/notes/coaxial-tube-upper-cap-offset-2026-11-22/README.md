# D1610 — Offset the original upper annular cap of a coaxial tube

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `f0ea3fa9d04d218e081c12738c12caa39a577238`.

Offset face moves the original upper cap of one upright coaxial tube from a forward circular Extrude and one through Hole. The signed distance moves only the upper axial station. The existing native station map keeps both wall cylinders, the fixed cap, and the original trim charts. The History editor retains the original face and exposes distance only.

- **PASS, desktop Studio WebGPU.** Pick `n1.top` on current Hole output `n2`. Drag the normal handle from +2 to a +3 mm preview with the source document intact. Apply +2 mm for height 18 mm. Refuse −16 mm at the opposite cap and keep height 18 mm. Apply −2 mm in History for height 14 mm. Undo, Redo and native Save and fresh Open retain the approved distance and original cap reference.
- **PASS, native geometry.** The original bottom is Z0. The outside and bore radii remain R12 and R4 with axis at (14, 9) mm. Native owners, incidence and UV trim charts agree with the source. The native volumes at heights 16, 18 and 14 mm are 6433.981754551888, 7238.229473870887 and 5629.734035232882 mm³, within 3e−11 mm³ of 128π × height. Maximum observed edge-to-surface gap is 1.78e−15 mm. The reopened file retains the same measured geometry, incidence and volume. The rectangular plate cap flow still passes in Studio.
- **PASS, affected checks.** 96 Kernel, 75 Model and 44 Studio tests. The 62 tests in the directly touched Kernel suite also pass after its lint-only correction. Kernel, Model and Studio types, scoped lint, production build, driver syntax and Git diff pass. The two final Studio runs report zero frozen-file changes, runtime errors and console errors.
- **FAIL, corrected focused checks.** The first Model type check refused an optional test method inside an assertion closure. Capture the narrowed method. Scoped lint then found an ignored data field in the existing Kernel test helper. Rename that binding and rerun the affected check.
- **FAIL, existing separate code-shape check.** `node scripts/code-shape.mjs --check` in the Kernel package reports `src/brep/cylindrical-bore.ts: spread-minmax 0 → 3`. The file, checker and checker baseline match the product base bytes. The product change does not edit them.
- **NOT_RUN.** Bottom annular offsets, tilted or linked plane changes and chains as supported edits, other renderers, exchange, mobile and full local suites. #629 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep evidence outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{bored-cap-offset,bore-wall-offset,circular-wall-offset,drafted-cap-offset}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model test offset-face-native face-end-extrude native-offset-result
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,part/part-model}.ts packages/barocss-cad/test/bored-cap-offset.test.mjs packages/barocss-cad-model/src/{app/nativeOffsetFace,app/profileCommands,app/offsetFaceEdit,engine/doc}.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/offset-bored-cap-browser.mjs
pnpm --dir apps/cad-studio test offset-face-launch-view offset-cap-feedback history-feature-apply viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/offset-bored-cap-browser.mjs
D1610_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-bored-cap-browser.mjs "$EVIDENCE/tube" --tube
BORE_CAP_OFFSET_FROZEN=1 node apps/cad-studio/test/offset-bored-cap-browser.mjs "$EVIDENCE/plate"
git diff --check
```

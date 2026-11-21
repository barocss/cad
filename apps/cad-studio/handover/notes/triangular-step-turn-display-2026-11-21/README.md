# D1550 — Refine compact triangular Smooth Turn display after STEP Open

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 93322cf5cdde062e07f692dfd3d36ac2d767cbc7.

Admit compact triangular STEP Turns through the same checked native boundary incidence as rectangular Turns. Each wall binds two cubic rails and two straight rim edges. Each cap has three boundary vertices and a planar support. Refit the triangle's signed station geometry and compare its entire cubic control polygons and knot vectors. Use the existing q24 display with native surface normals. The imported STEP document, B-rep and selection IDs are retained.

- **PASS, actual desktop Studio.** Open the exact D1549 AP214 bytes on WebGPU and WebGL2. Both renderers attach 690 display triangles in place of 224. Over 1,001 samples per rail at the same candidate camera, the maximum projected chord error falls from 0.947723 px to 0.117863 px. The selected native rail uses 78 segments instead of 26. Actual wireframe clicks on both backends select body 0, edge 1, persistent imported edge n0_e82. The two candidate cameras and native reads match exactly. The D1549 baseline screenshot is a separate Fit capture.
- **PASS, native and round-trip checks.** The exact imported document still has one strict native solid with 5 faces, 9 edges and 6 vertices, volume 1050.0612784061154 mm³, and digest af554de38fc6c62a30c7bd06f873284bed318ebc5871710b24adf3d067d5da09. The complete export and fresh Open driver independently verifies the STEP geometry and observes the refined packet. The final browser receipts report zero console errors, runtime errors and frozen-source changes.
- **PASS, affected checks.** Six native, 21 Model and 43 Studio tests, scoped ESLint, driver syntax, kernel library build, Model types, Studio production build and types, and Git diff. The triangle tests cover both signs, renamed and reordered entities, a shifted cap, a coherently deformed rail and exact canonical mesh ownership including the sharper side normals. Existing rectangular STEP coverage passes.
- **FAIL.** No D1550 validation failures observed.
- **NOT_RUN.** General third-party STEP shapes, other CAD applications, wider Screw or Twist features, mobile and full local suites. #630 remains open.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and keep captures outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{smooth-rectangular-turn,two-guide-loft-display}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle ruled-turn-command step-export-scope
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
git diff --check
jq '{doc}' "$D1549/approved-turn-step-reopened.json" > "$EVIDENCE/step-opened-doc.json"
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgpu" "$D1549/approved-turn-from-studio.step" "$EVIDENCE/step-opened-doc.json" --step --triangle
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgl2" "$D1549/approved-turn-from-studio.step" "$EVIDENCE/step-opened-doc.json" --step --triangle --webgl2
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/roundtrip" "$D1548/reviewed-smooth-turn-reversed.bcad" --triangle
```

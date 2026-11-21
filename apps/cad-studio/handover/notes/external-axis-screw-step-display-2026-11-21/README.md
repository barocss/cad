# D1563 — Restore structured display on imported AP214 Screws

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 58afa4ee1a414876c95ed2845d68f725f8c73ce1.

Keep the existing strict STEP shell, cap, support, rail-binding, unit-weight and common-knot checks. Check the centered family first. For the rectangular external-axis family, determine height from the parallel cap normals. Use the control column with the largest rotation determinant to recover the external pivot in the start cap frame. Require measurable section centroid movement and a rectangular cap at the display tolerance. Refit the existing compact Screw from evenly spaced stations and compare every native pole and knot. Use D1555's grid only for the recognized compact family, with the same canonical indexes. The import and B-rep remain the original AP214 result.

- **PASS, actual desktop WebGPU and WebGL2.** Open both D1562 AP214 files anew in each renderer. Each uses the 1,712-triangle grid over a 200-triangle canonical body. Compare 1,001 native curve samples per rail and both display tiers at the same camera. The worst projected rail deviation falls from 1.447904 to 0.111578 px for +360° and from 1.412145 to 0.092478 px for −360°. Each renderer clicks and selects the exact imported edge `n0_e93` at canonical index 1. The four receipts have one closed solid, six faces, twelve edges, eight vertices, volume 5,376.154360963081 mm³, and zero runtime errors, console errors or source changes. Both imported documents retain their exact STEP bytes.
- **PASS, Model controls.** The tilted-axis +180°, −360° and +450° imports recognize the same family, even with relabeled and reordered native faces and edges. Only the supported body in the two-body file gets the detail. The base mesh and all canonical owners remain equal. A strictly valid control that displaces every rail and its paired surface rows at a common control column falls back to the base mesh.
- **PASS, affected checks.** 23 Model and 43 Studio tests, Kernel and Model type checks, Studio build and type check, scoped ESLint, browser syntax and Git diff. The earlier centered and triangular import display regressions pass.
- **FAIL, corrected during development.** The first fixture used a Box command without its placement defaults, and the first type check could not infer a test mesh type. Build the separate control from an explicit sketch and Extrude, and type the inspected result.
- **NOT_RUN.** Other STEP producers and reversed imported rail parameterizations, third-party CAD, full-view depth certification, mobile and full local suites. #630 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and the two D1562 AP214 files with their reopened document snapshots. Gate heavy work and retain evidence outside Git.

```sh
pnpm exec eslint packages/barocss-cad/src/internal/step-turn-display.ts packages/barocss-cad-model/src/engine/{loftDisplay,screwDisplay}.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad type-check
for side in positive negative; do
  TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/$side-webgpu" "$D1562/$side/approved-turn-from-studio.step" "$D1562/$side/approved-turn-step-reopened.json" --step --screw
  TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/$side-webgl2" "$D1562/$side/approved-turn-from-studio.step" "$D1562/$side/approved-turn-step-reopened.json" --step --screw --webgl2
done
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
```

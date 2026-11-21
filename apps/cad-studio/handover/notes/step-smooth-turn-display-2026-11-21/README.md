# D1543 — Refine recognized STEP Smooth Turns in Studio Model

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base: 17a949f4a465362d592e644e86fd120d9c0c856e

Use the existing fine Model display packet for the closed rectangular Smooth Turn reopened from STEP. Discover the four cubic rails by their incidence with both planar rims and their bound side support rows. The normalized rail knots and control polygons must match the compact fit recovered from the imported geometry. Validate this in the cap frame, including cap plane incidence and the signed rotation check. Labels, section nodes and original authoring History are unnecessary. The imported document, native B-rep and canonical pick tables supply the geometry and identity throughout.

- **PASS, actual Studio in desktop Chrome (WebGPU and WebGL2).** Open the STEP produced by D1542. Across 1,001 samples per rail at the same camera, the maximum projected chord error is 1.045153 px at the original density and 0.125450 px at the new density. The measured selected rail uses 85 segments instead of 29, and its body uses 1,372 display triangles instead of 476. Both backends select body 1, edge 1, persistent ID n0_e421. Both preserve the two imported solids, exact reopened document, and Smooth Turn volume of 6400.823197481391 mm³. The frozen browser reports zero console or runtime errors. Actual pre-change and post-change Fit cameras differ by 0.022622 mm in distance, so the error comparison uses both densities at the post-change camera.
- **PASS, native control.** The D1540 authored project still uses its refined display packet, draws 1,292 triangles in place of 444, and picks its original native rail c0. The Ruled Turn stays on its original packet.
- **PASS, affected checks.** Six native, 25 Model and 43 Studio tests, scoped ESLint, kernel library build including the internal export, Model and Studio types, Studio production build, driver syntax and Git diff. Imported +360° and −450° tilted cases refine after label and entity order changes. A shifted cap and coherently deformed rail use the original packet. A separate cubic-pole comparison matches the actual STEP fit within 1.32e-14 mm.
- **FAIL, corrected fixture.** The first relabel test reused names and failed strict native validation. The corrected test uses unique arbitrary labels, which are valid independently of their original names.
- **NOT_RUN.** External CAD applications, general third-party STEP shapes, browser engines beyond desktop Chrome, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and the installed Chrome and Playwright. Run heavy commands serially through the gate. Keep browser artifacts outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{smooth-rectangular-turn,two-guide-loft-display}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs smooth-turn-angle ruled-turn-command api-loft-guide mesh-wire step-export-scope
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgpu" "$D1542/approved-turn-from-studio.step" "$D1542/approved-turn-step-reopened.json" --step
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgl2" "$D1542/approved-turn-from-studio.step" "$D1542/approved-turn-step-reopened.json" --step --webgl2
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/native-control" "$D1538/smooth-turn-width-16.bcad"
```

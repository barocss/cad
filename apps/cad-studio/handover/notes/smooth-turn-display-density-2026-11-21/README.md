# D1540 — Refine the displayed faces and edges of a Smooth Turn

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `53178a5fc9bc364e751d7dc92184ca83e672b4af`.

Studio uses denser display samples for the compact rectangular Smooth Turn created from the recognized rotated sections. The Model worker verifies the native rail structure and the face and edge owners before it attaches the optional packet. The two renderers draw faces and edges from the same packet in the ordinary Model view. The canonical geometry, pick tables and mass data stay available to the other consumers.

- **PASS, actual desktop Studio.** Open the same D1538 native document with a Ruled Turn and a Smooth Turn. The verified Smooth Turn is the second body. In the baseline WebGPU scene its selected native rail `c0` reports 27 rendered segments. In the candidate both WebGPU and WebGL2 report 80 segments and the same body and edge indices (1 and 8). A real click selects that rail in all three runs. The Ruled Turn draws with its canonical samples. AO is off in the shaded comparison, and each run changes to Wireframe without moving its camera.
- **PASS, numerical display and native checks.** Project 1,001 samples per native rail and each of the two polylines through the same actual candidate camera. The maximum sampled nearest-point error over all four rails drops from 1.059693 to 0.124211 pixels. Candidate WebGPU and WebGL2 cameras agree exactly. The uploaded Smooth Turn surface increases from 444 to 1,292 triangles. The exact B-rep digest remains `e8159b3b0fdf07bb2e8f537fd64b59d86cd5a9fcc20398623dd532f6b45076de`. The closed solid has six faces and 12 edges, with volume 5120.658557985098 mm³. The baseline Frame all camera distance differs from the candidate by 0.042385 mm because it frames the old display bounds. The numerical comparison uses the same candidate projection for both densities.
- **PASS, preservation and affected checks.** The Model test covers both body orders, opposite signed turns, exact canonical buffers and mass data, worker transfer and placement. The existing two-guide display control passes in actual desktop Studio. The three turn runs report zero runtime errors, console errors and frozen-source edits. 27 Model and 29 Studio tests, scoped lint, Model and Studio types, Studio build, browser syntax and Git diff pass.
- **FAIL, corrected setup and test typing.** The first baseline inspector had an incorrect package path before Chrome started. The first type check found a missing explicit type on the test's body binding. Both corrected checks pass.
- **NOT_RUN.** Full local suites, mobile, broad renderer changes, camera-distance or performance acceptance across large models. Some grazing-angle marks remain visible. The earlier sun-shadow observation is separate in D1539, and #630 stays open.

Run with Node 22.19.0, installed desktop Chrome and Playwright. Gate heavy work and keep screenshots and raw receipts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-turn-angle ruled-turn-command api-loft-guide loft-section-history-edit mesh-wire
pnpm --dir apps/cad-studio test viewport display-mode
pnpm exec eslint apps/cad-studio/src/viewport/Viewport.tsx apps/cad-studio/test/smooth-turn-rail-display-browser.mjs packages/barocss-cad-model/src/app/smoothLoftTurn.ts packages/barocss-cad-model/src/engine/{evaluate,loftDisplay,mesh}.ts packages/barocss-cad-model/test/{api-loft-guide,smooth-turn-angle}.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/baseline" "$D1538/smooth-turn-width-16.bcad" --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgpu" "$D1538/smooth-turn-width-16.bcad"
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgl2" "$D1538/smooth-turn-width-16.bcad" --webgl2
D1282_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-display-browser.mjs "$EVIDENCE/two-guide"
```

Run the baseline command before applying the product change. Use the same saved file for all three Turn runs.

# D1591 — Refine centred circular Twist STEP display

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `e1c6321bd1fbed47d8e2160b567917e26884f917`.

The D1590 signed STEP solids kept their native shape and used only the coarse display mesh. Extend the compact rational classifier to recognize a fixed area centroid coincident with the axis recovered from the rails. Reuse the signed native fit, tight display tolerance, full pole and weight matching, and existing refined mesh. The exterior circular Screw keeps its existing classification.

- **FAIL, previous display.** Both exact STEP imports lack the refined packet in desktop WebGPU and WebGL2. At the fixed Model camera the contour errors exceed the 0.25 CSS px acceptance bound.
- **PASS, desktop WebGPU and WebGL2.** Open both exact D1590 files in each renderer and compare 1,001 native samples per visible rail at their respective baseline cameras. The same click selects native edge `n0_e78` at canonical index 1 in all runs. The selected trace increases from 34 to 98 segments. The hidden tangent seam `n0_e94`, native digest, topology, volume and document remain identical. Final browser receipts have zero runtime errors, console errors and frozen source changes.

| Winding | Maximum rail error (CSS px), both renderers | Display triangles |
| --- | ---: | ---: |
| −450° | 0.291170 → 0.036331 | 2,382 → 20,850 |
| +450° | 0.271649 → 0.034562 | 2,160 → 15,110 |

- **PASS, Model controls.** Both signs qualify after face and edge rename and reorder. The base mesh and all canonical face and edge tables are equal. Strict-valid radius, 2e−9 mm off-centroid and interior control variations keep the base display. Existing circular-segment Screw tests pass.
- **PASS, affected checks.** 49 Model and 43 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** General imported surfaces, shaded-depth comparison, third-party STEP producers, mobile and full local suites.

#630 remains open. The roadmap now moves to direct B-rep model editing under row 31.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use the exact D1590 STEP files and their reopened document snapshots. The existing curved-case harness option checks the shared refined mesh without a structured grid. Gate each heavy run and store all captures outside Git.

```sh
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$BEFORE" "$STEP" "$REOPENED_JSON" --step --screw --polygon=3 --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$AFTER" "$STEP" "$REOPENED_JSON" --step --screw --curved-screw --polygon=3 "--compare=$BEFORE/receipt.json"
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn step-export-scope
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/internal/step-turn-display.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
```

Repeat both browser commands with `--webgl2`.

# D1570 — Restore structured display for triangular Screw STEP imports

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `83dc1024ea7f5be98c5b5fde927d26d5be7b0f66`.

Extend the compact STEP display classifier to the triangular external-axis family. Validate the strict closed shell and paired native rail and side charts. Check the centered family first. Recover the exterior pivot from the common rotation factors and require centroid motion greater than four times the larger of the native fit tolerance and display tolerance. Reuse the native triangle's clearance tolerance and signed fit. Compare every native pole and knot against that fit before enabling the structured display.

- **FAIL, previous display.** The D1569 signed AP214 fixtures open with coarse display packets. Both renderers can pick the native edge. The maximum projection error over the three rails is `0.786751 px` for −450° and `0.856640 px` for +450°.
- **PASS, actual desktop WebGPU and WebGL2.** Open the same D1569 STEP bytes in each backend and replay the exact baseline camera with a camera-only test hook. Each reopened body uses the 1,284-triangle structured display over a 240-triangle canonical packet. Measure 1,001 native curve samples per rail. The maximum projection error is `0.096279 px` for −450° and `0.092226 px` for +450° in both renderers. Each actual wireframe click selects the same imported edge `n0_e82` at the same canonical index as before. The imported document, B-rep digest, topology and volume match the baseline. The four candidate receipts have zero runtime errors, console errors and frozen-source changes.
- **PASS, Model controls.** Both directions qualify from tilted source frames, including a translated and rotated clockwise profile. Face and edge order and names are independent of recognition. The canonical mesh matches the regular evaluation, including the neighboring separate extrusion. A centered triangle still qualifies as a Turn. A strictly valid interior-axis triangle and a strictly valid external candidate with a common nonlinear axial pole displacement both leave the structured display path.
- **PASS, affected gates.** 30 Model and 43 Studio tests, Kernel and Model types, scoped ESLint, Studio production build, browser syntax and Git diff.
- **NOT_RUN.** Third-party STEP producers, reversed rail parameterizations, whole-screen depth certification, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate heavy runs. Use the D1569 STEP files and their fresh Open JSON snapshots. Keep evidence outside Git.

```sh
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$BEFORE" "$STEP" "$REOPENED_JSON" --step --screw --triangle --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$AFTER" "$STEP" "$REOPENED_JSON" --step --screw --triangle "--compare=$BEFORE/receipt.json"
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/internal/step-turn-display.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
```

Repeat the two browser commands with `--webgl2` for WebGL2.

# D1546 — Shade compact Smooth Turn sides with native surface normals

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base b0802db7d59a3ce8450b59bae248476aa232b4e7.

The shared ruled mesher provided triangle-averaged normals for these walls. The fine Model packet now uses the exact surface derivatives on admitted compact Smooth Turns. Recover the source parameters from axial height and across the straight section. Check each reconstructed point against its mesh position before using its normal. Use the face sense, preserve the cap normals and retain the original normals if the chart or its samples do not qualify.

- **PASS, independent normals.** A separate unit-weight de Boor evaluation of both native rails and their derivative polygons checks 556 side vertices of a −450°, 50 mm triangular Turn. Maximum position residual is 2.63e-14 mm. Maximum angular deviation falls from 68.438186° to 0.000002354°. The q24 positions, indices, face and edge ownership, edge-line buffers and cap normals compare exactly. The canonical native edge ID table is exact.
- **PASS, actual desktop Chrome Studio.** Reopen the exact D1544 solid. The two Model backends compare at the same D1545 camera with AO off and the original 690 display triangles. In the 47 × 65 pixel patch with origin (682, 314), the 95th percentile adjacent vertical RGB-average step drops from 2.67 to 1.00 levels for WebGPU and 4.00 to 1.67 for WebGL2, on the 0–255 scale. The broad bands recede in both modes. Some fine shading variation remains near steep creases. The native digest stays f7ca47f91445638b850c7efa26fbfbb029fb7fb6b4fc65f51039e853b81a1d23. No console errors, runtime errors or frozen-source changes occur.
- **PASS, actual rectangle controls.** Desktop WebGPU reopens the authored rectangular project and its separate approved STEP control. It retains 1,292 and 1,372 fine triangles, respectively. Actual clicks still select c0 and n0_e421. At each measured camera, the original q24 rail chord maxima remain 0.124211 and 0.125450 px, respectively.
- **PASS, affected checks.** 24 Model and 29 Studio tests, scoped ESLint, Model types, Studio production build and types, and Git diff.
- **FAIL.** No D1546 validation failures observed.
- **NOT_RUN.** General twisted profiles, other lighting conditions or CAD applications, mobile, and full local suites. #630 stays open. The shared renderer and native spline geometry are outside this decision.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Use the heavy gate and keep screenshots outside Git.

```sh
TURN_NORMAL_METRICS=1 node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle ruled-turn-command api-loft-guide mesh-wire
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio test viewport display-mode
pnpm --dir apps/cad-studio build
git diff --check
TURN_SHADOW_FROZEN=1 node apps/cad-studio/test/triangular-turn-model-shadow-browser.mjs "$EVIDENCE/triangle" "$D1544/smooth-triangular-turn.bcad"
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/native" "$D1538/smooth-turn-width-16.bcad"
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/step" "$D1542/approved-turn-from-studio.step" "$D1542/approved-turn-step-reopened.json" --step
```

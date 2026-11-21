# D1565 — Close visible seams on compact Twist walls in Model

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `b971b1e9a0d2c911d7074e84a6515be7be3bef52`.

## Decision

Sample the three or four compact Loft walls on one set of native rail stations. Adjacent walls and their displayed rails use identical sample positions. Include the native knots and derive the wall normals from the native surface derivatives. Match each cap rim to the same end samples. Use the native corner crease between side faces and keep the native edge and face owners for selection.

Admit an authored smooth Loft after native compact shape verification, including a Loft built from several selected sketches. Check the solid, faces, vertices, ordered section count, cubic rails and their shared knots. Check the native side charts and cap loops in the display builder. Preserve the per-command Screw signal for proposal review and the established display scope for imports.

## Evidence

- **PASS, fixed-camera desktop Studio.** Open the same saved +360° rectangular Twist and −360° triangular Screw before and after in actual WebGPU and WebGL2. Replay the previously captured camera with a camera-only test hook. Sample each projected native rail at 1,001 curve parameters. Both renderers use the same projected values below. The displayed triangular wall and its boundary appear continuous in the tested view. A real wireframe click selects native rail `c0` on each body and backend. Both native digests, volumes and saved documents match.
- **PASS, native display checks.** On the tilted triangular cases, reach each used spatial triangle edge exactly once in each direction and reject zero-area display triangles. Independent de Boor samples verify side vertices and their normals within `1e-8 mm` and `1e-5°`. Verify cap normals and identical canonical mesh data. The focused controls cover ruled and guided Loft, imported turns, proposal preview and native owner transport.
- **PASS, focused regression.** 34 Model and 32 Studio checks, Model type check, scoped ESLint, browser syntax and Studio production build.
- **FAIL, initial verification.** A regression fixture needed explicit TypeScript types for points and faces. The final type check passed. The old test assumed the display packet always had more triangles than the canonical packet. Replace this assumption with the displayed topology and native owner checks. Frame All moved the camera slightly after the refined bounds changed. The fixed-camera retry restores the exact baseline camera before capture and measurement.
- **Open visual finding.** Fine lines remain on the rectangular Twist with WebGPU AO enabled. They disappear with AO off at the same camera. This decision corrects the displayed wall and edge samples.
- **NOT_RUN.** Exact shaded GPU depth error, arbitrary Loft side profiles, other zooms and cameras, full local suites and mobile. #630 remains open.

| Saved project | Maximum projected rail error before | After | Display triangles before → after |
| --- | ---: | ---: | ---: |
| +360° rectangular Smooth Turn from the Twist palette | 0.139244 px | 0.083043 px | 1196 → 1552 |
| −360° triangular external-axis Screw from Smooth Loft | 0.980545 px | 0.076099 px | 138 → 1164 |

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Keep the D1564 saved projects and Studio captures outside Git. Run the baseline on the base product source with this decision's test driver. Use `--triangle` for the triangular project and `--webgl2` for a WebGL2 capture. Gate each heavy operation.

```sh
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$BEFORE" "$PROJECT" --compact-grid --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$AFTER" "$PROJECT" --compact-grid "--compare=$BEFORE/receipt.json"
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/{evaluate,loftDisplay,screwDisplay}.ts packages/barocss-cad-model/test/{smooth-triangular-turn,smooth-turn-angle}.test.ts apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode palette-rank
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
```

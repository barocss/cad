# D1581 — Restore structured viewport display for quadrilateral Screw STEP imports

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `3f3914fed03c83cc32f17e3d5265c90a3112dc48`.

Recognize a compact non-rectangular quadrilateral Screw after the existing centered and rectangular tests. Recover the external axis with the longest cap chord. Reuse the exact convexity and axis clearance checks, signed native fit and complete knot and pole comparison. The admitted result uses the existing structured wall grid and canonical edge table.

- **FAIL, previous display.** All four D1580 AP214 files open with visible faceting. The maximum projected rail error is 1.848907 to 1.917893 CSS pixels across these views.
- **PASS, actual desktop WebGPU and WebGL2.** Open all four exact STEP files in both backends and replay their baseline cameras. Compare 1,001 native samples per visible rail. All eight candidate runs give a maximum projected rail error below 0.111 CSS pixels. The same screen clicks select the same native edge at canonical index 1. The visible edge set, imported document, native digest, volume and topology match the baseline. All candidate receipts have zero runtime errors, console errors and frozen source changes.

| Profile and winding | Maximum rail error (CSS px) | Viewport triangles | Same native edge |
| --- | ---: | ---: | --- |
| Trapezoid −450° | 1.869177 → 0.110060 | 314 → 1712 | `n0_e94` |
| Trapezoid +450° | 1.848907 → 0.100681 | 314 → 1712 | `n0_e94` |
| Skew quadrilateral −450° | 1.917893 → 0.096279 | 290 → 1712 | `n0_e93` |
| Skew quadrilateral +450° | 1.904170 → 0.092226 | 290 → 1712 | `n0_e93` |

- **PASS, Model controls.** Both signed trapezoid and skew quadrilateral imports qualify, including renamed and reordered native records. A strictly valid quadrilateral rotating around an interior axis and a modified axial pole remain outside the structured path. The triangle, rectangle, larger convex polygon and neighboring separate extrusion controls pass.
- **PASS, affected checks.** 38 Model and 43 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Third-party STEP producers, whole-view depth error, grazing rays, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use each D1580 STEP file and its reopened project snapshot. Gate heavy runs and retain captures outside Git.

```sh
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$BEFORE" "$STEP" "$REOPENED_JSON" --step --screw --polygon=4 --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$AFTER" "$STEP" "$REOPENED_JSON" --step --screw --polygon=4 "--compare=$BEFORE/receipt.json"
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle step-export-scope
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/internal/step-turn-display.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
```

Repeat both browser commands with `--webgl2` for the WebGL2 captures.

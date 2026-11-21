# D1586 — Refine viewport display for circular-segment Screw STEP imports

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `6e286ed38a0853811f61964a723d4b3d4faa73b2`.

Recognize the compact rational family with one chord, two equal circular arc pieces and three cubic rails. Recover the frame and exterior axis from the native cap and rail geometry. Verify the weighted boundary bindings, tangent-intersection controls, circular arc orientation, signed fit and each surface knot and pole. Use the existing high-density Loft display for those imported solids and retain the canonical native selection tables.

- **FAIL, previous viewport.** Both D1585 AP214 files display coarse contours. Across both renderers the −450° and +450° cases reach 0.822965 and 1.023904 CSS pixels of rail error.
- **FAIL, initial classifier control.** A strict B-rep with both recovered circle centres shifted by 2e-9 mm kept its curved cap and wall bindings and the common V law. The initial candidate classified it as circular. The final tangent-control guard rejects it and retains the base display.
- **PASS, actual desktop WebGPU and WebGL2.** Open the same two exact STEP files in both backends and replay their baseline cameras. Compare 1,001 native samples per visible rail. The same click selects `n0_e78` at canonical index 1 in every run. The visible edge set, hidden tangent seam, native digest, topology, volume and imported document match the baseline. All final receipts have zero runtime errors, console errors and frozen source changes.

| Winding | Maximum rail error (CSS px) | Viewport triangles |
| --- | ---: | ---: |
| −450° | 0.822965 → 0.092359 | 5286 → 39298 |
| +450° | 1.023904 → 0.115894 | 5236 → 36454 |

- **PASS, Model controls.** Both windings qualify with renamed and reordered native records. An altered interior wall weight and the matched-boundary pseudo-arc keep the base display. An unrelated neighboring extrusion retains its canonical packet.
- **PASS, affected checks.** 44 Model and 43 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Third-party STEP producers, whole-view depth measurement, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use both exact D1585 STEP files and their reopened project snapshots. Gate heavy runs and keep captures outside Git.

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

Repeat both browser commands with `--webgl2` for the WebGL2 captures.

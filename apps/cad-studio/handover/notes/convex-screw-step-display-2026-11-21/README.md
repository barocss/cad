# D1576 — Restore structured viewport display for polygon Screw STEP imports

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `e2c7c623bb8201439df356feb80727bf34b06620`.

Recognize a compact external-axis polygon Screw from the imported native cap and wall topology. Use the longest cap chord to recover the frame and pivot. Check exact strict convexity and external-axis clearance in that frame. Require signed rotation and linear advance, then compare every native knot and control pole with the recovered fit. Build the shared wall display from the canonical face and edge tables.

- **FAIL, previous display.** The four D1575 AP214 files reopen with visible faceting. The maximum visible rail error is 1.049907 to 1.377134 CSS pixels in the tested views.
- **PASS, actual desktop WebGPU and WebGL2.** Open the same four signed STEP files in both backends. Replay each exact baseline camera and compare 1,001 native samples per visible rail. All eight candidate runs give a maximum projected rail error below 0.10 CSS pixels. The same clicks select the same native edge at canonical index 1. The visible edge set, document, imported native digest, topology and volume match the baseline. The receipts have zero runtime errors, console errors and frozen source changes.

| Profile and winding | Maximum rail error (CSS px) | Viewport triangles | Same native edge |
| --- | ---: | ---: | --- |
| Pentagon −450° | 1.358057 → 0.096279 | 378 → 2140 | `n0_e106` |
| Pentagon +450° | 1.377134 → 0.092226 | 378 → 2140 | `n0_e106` |
| Hexagon −450° | 1.068910 → 0.099930 | 468 → 2568 | `n0_e118` |
| Hexagon +450° | 1.049907 → 0.087746 | 468 → 2568 | `n0_e117` |

- **PASS, Model controls.** Both polygon windings, regular 7- and 64-sided imports, translated and tilted triangles and canonical face and edge ownership pass. The classifier accepts renamed and reordered input records. A nearby separate extrusion receives its usual packet. A valid compact polygon around an interior axis and a nonlinear axial control pole displacement stay outside the structured path.
- **PASS, affected checks.** 38 Model and 43 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Third-party STEP producers, whole-view depth error and grazing rays, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use the STEP file and reopened project snapshot from each D1575 run. Use 5 or 6 for `SIDES`. Gate heavy runs and keep captures outside Git.

```sh
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$BEFORE" "$STEP" "$REOPENED_JSON" --step --screw "--polygon=$SIDES" --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$AFTER" "$STEP" "$REOPENED_JSON" --step --screw "--polygon=$SIDES" "--compare=$BEFORE/receipt.json"
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle step-export-scope
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/internal/step-turn-display.ts packages/barocss-cad-model/src/engine/loftDisplay.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
```

Repeat the two browser commands with `--webgl2` for the WebGL2 captures.

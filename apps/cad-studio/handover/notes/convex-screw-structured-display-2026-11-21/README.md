# D1572 — Share viewport samples on convex polygon Screw walls

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `0a6c21d6316617eb7a289e848041a81ed1d96e97`.

Use the structured wall grid for the authored compact convex polygon Screw from D1571. The native rail IDs and the pole and station counts distinguish the compact fit. Pair each displayed face with one native face. Use every native rail for shared wall geometry and cap boundaries. Build edge samples from the canonical viewport edge table so the visible rail indices still identify the same native owners. Use the native surface derivatives for wall normals.

- **FAIL, previous display.** Open the two saved D1571 −360° projects. The original triangles produce visible faceting and first-hit discrepancies. Both desktop renderers exceed `0.25 CSS px` of maximum projected rail error. The pentagon displays four of its five rails. Its tangent rail `c4` is absent from the canonical wireframe.
- **PASS, actual desktop WebGPU and WebGL2.** Open the same files and replay the exact captured cameras. Compare 1,001 native samples per visible rail. The same actual clicks select `c0` at canonical index 10 on the pentagon and index 12 on the hexagon. The visible rail set and native selection indices match the baseline. The document, native digest, topology and volume match exactly. The receipts have zero runtime errors, console errors and frozen source changes.
- **PASS, independent depth comparison.** Capture the live WebGPU Model packet and replay the same camera. At each ray, compare the first triangle hit with an independent native cubic wall evaluation. Both 2,048- and 4,096-interval sign brackets agree on all 288 rays per profile. Candidate median and maximum depth error fall in both fixed crops. The two crops are `[670,336,91,70]` and `[597,560,119,92]` in CSS pixels, with an 8 px sample stride. Planar cap hits use planar reference triangles.

| Profile | Viewport triangles | Max rail error (CSS px) | Max depth error in the crops (mm) | First-hit face or coverage discrepancies |
| --- | ---: | ---: | ---: | ---: |
| Pentagon | 212 → 1940 | 1.669973 → 0.076099 | 1.725616 → 0.174542 | 8 → 0 |
| Hexagon | 270 → 2328 | 1.117895 → 0.078011 | 2.511973 → 0.602843 | 3 → 0 |

- **PASS, Model and affected checks.** The pentagon, hexagon, regular heptagon and both 64-gon windings have closed triangle seams, canonical edge ownership and wall normals within `1e-5°` of the native derivatives. The wall vertices match the independently evaluated surfaces within `1e-8 mm`. Triangle and rectangle controls pass. 41 Model tests, 38 Studio tests, Model types, scoped ESLint, Studio build, browser syntax and Git diff pass.
- **NOT_RUN.** Whole-screen or grazing-ray depth bounds, polygon STEP exchange, single-sketch polygon authoring, mobile and full local suites. #630 remains open.

Use the installed desktop Chrome and Playwright with Node 22.19.0. Set `PROJECT` to the corresponding saved D1571 project and `SIDES` to 5 or 6. Gate heavy runs and retain captures outside Git.

```sh
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$BEFORE" "$PROJECT" "--polygon=$SIDES" --baseline
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$AFTER" "$PROJECT" "--polygon=$SIDES" "--compare=$BEFORE/receipt.json"
SCREW_DEPTH_FROZEN=1 node apps/cad-studio/test/smooth-screw-depth-browser.mjs "$DEPTH_BEFORE" "$PROJECT" "--polygon=$SIDES"
SCREW_DEPTH_FROZEN=1 node apps/cad-studio/test/smooth-screw-depth-browser.mjs "$DEPTH_AFTER" "$PROJECT" "--polygon=$SIDES" --grid "--camera=$DEPTH_BEFORE/view.json"
python3 apps/cad-studio/test/smooth-screw-depth-oracle.py "$DEPTH_BEFORE" "--polygon=$SIDES"
python3 apps/cad-studio/test/smooth-screw-depth-oracle.py "$DEPTH_AFTER" "--polygon=$SIDES" --grid
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/{loftDisplay,screwDisplay}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/{smooth-screw-depth-browser,smooth-turn-rail-display-browser}.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
node --check apps/cad-studio/test/smooth-screw-depth-browser.mjs
git diff --check
```

Repeat the rail commands with `--webgl2` for the WebGL2 captures.

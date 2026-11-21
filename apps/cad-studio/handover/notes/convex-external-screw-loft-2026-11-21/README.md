# D1571 — Build compact external-axis Screw from convex polygon sections

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `68ddc9d465e0ad3757116c98d3dc55c9e70680c9`.

Use the authored correspondence for smooth, straight, strictly convex polygon sections with 5 to 64 sides at uniform axial stations. Prove strict convexity and simplicity with exact orientation tests. Check the origin against the edge half-spaces and the exact distance to each closed edge. Retain the existing 7 to 16 station limit and maximum 30° step. Use the longest initial vertex radius for the signed fit. This keeps Model coordinate rounding from dominating a short reference edge. Reuse the compact cubic wall and retain native caps and rail ownership. Other Loft admission follows the prior paths.

- **FAIL, previous desktop behavior.** With 13 sections through −360° and +360°, the pentagon and hexagon both reported `Surface V control point count must be in 2..16`. Apply was disabled and the documents stayed intact.
- **PASS, actual desktop Chrome.** Open the tilted source sketches, select all 13 sections in the Browser and apply Smooth Loft. Both profiles make one strict closed native solid at +360° and −360° through 40 mm. Each rail has 13 cubic poles. The signed angular derivative and the axial derivative pass at 121 samples per rail. Every original station is within `1e-8 mm`. Save and Open in a fresh Chrome context for each −360° case. The project and native digest match exactly. Both runs have zero runtime errors, console errors and frozen source changes.
- **PASS, Model.** Both signs pass on asymmetric pentagon and hexagon profiles and a regular heptagon. The regular 64-gon passes at +360°. Track each starting corner to its original stations and integrate sampled signed angular increments through the full turn. A regular heptagon's nearest cyclic order can map +30° to −21.428571° per station. The first candidate also refused a clockwise heptagon at −360° after coordinate rounding. The longest-radius reference stays within the existing factor tolerance. A concave outline and interior, edge-touching and vertex-touching axes stay outside the new path.

| Profile | Faces / edges / vertices / coedges | Independent volume (mm³) | Studio volume (mm³), either sign | Worst station error (mm) |
| --- | --- | ---: | ---: | ---: |
| Pentagon | 7 / 15 / 10 / 30 | 1080.138914574982 | 1080.1389145673 | 7.768e−10 |
| Hexagon | 8 / 18 / 12 / 36 | 1840.2366692758953 | 1840.2366692643 | 9.295e−10 |

The independent calculation uses the shoelace area and a separately solved clamped cubic rotation interpolant. Integrate squared rotation magnitude with four-point Gauss quadrature on each knot span and multiply by the initial area and height. Native volume error is at most `1.16e-8 mm³` for the measured cases. The −360° native digests are `586742ca14fa7c54d918b63c9e81050851eb202870bb470149d67c0cf530dad7` and `f7ee15bb6000380c3591fe5c2f89233cccaa6fb58f3f0a861f91c1eae4d0d99f`.

- **PASS, affected checks.** 41 Model tests, 38 Studio tests, Kernel and Model types, scoped ESLint, Studio production build, browser syntax and Git diff.
- **NOT_RUN.** Structured viewport quality, single-sketch polygon command, Agent authoring, STEP exchange, mobile and full local suites. The actual captures show visible faceting with the ordinary viewport packet. D1572 measures and addresses this display behavior before expanding direct authoring. #630 remains open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate the heavy runs and keep all captures outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/pentagon" --pentagon
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/hexagon" --hexagon
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/{loft,loft-rectangular-turn}.ts packages/barocss-cad/src/internal/{triangular-screw-axis,convex-polygon-screw-axis}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```

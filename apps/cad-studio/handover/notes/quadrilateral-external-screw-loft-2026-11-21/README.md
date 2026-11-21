# D1577 — Build a compact external-axis Screw from convex quadrilateral sections

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `1bfd91576d92fde5613a1249dced5ed68b450c4b`.

Apply the authored-order convex polygon Screw fit to a non-rectangular four-sided profile. Use the existing rectangle test to reserve rectangles for their established fit. The new quadrilateral path uses the same exact convexity and external-axis clearance checks, signed rotation proof and compact cubic builder as D1571.

- **FAIL, previous desktop behavior.** Smooth Loft refused the +360° trapezoid and the −360° skew quadrilateral at 13 sections. Studio reported `Surface V control point count must be in 2..16`, disabled Apply and kept both source documents exact.
- **PASS, actual desktop Chrome.** Apply Smooth Loft with both signed directions on each tilted profile. Each result is one strict closed native solid with 6 faces, 12 edges, 8 vertices and 24 coedges, and has 13 cubic control points per rail. The skew quadrilateral's axis is within its outline bounds and outside the profile. At 121 samples per rail, axial advance is linear and the angular derivative has the requested sign. Maximum authored station error is `7.768e-10 mm`. Save each −360° project, open it in a fresh Chrome context and match the project and native digest. Both runs have zero runtime errors, console errors and frozen source changes.

| Profile | Independent volume (mm³) | Native volume in either direction (mm³) | Native digest after −360° reopen |
| --- | ---: | ---: | --- |
| Trapezoid | 1360.1749294647923 | 1360.17492945741 | `9aed5009d51b51440d57bb3378e0ed43c89bbddc572c561fd110e15dfab9fcd9` |
| Skew quadrilateral | 980.1260521143356 | 980.12605210733 | `1b1ad814acf61ea10064cbd6f3ca6c5aca2af95b63d4d749c25f0d6673ab02bb` |

The independent calculation solves the clamped cubic rotation separately and integrates squared rotation magnitude over the knot spans. It uses the initial shoelace areas of 34 and 24.5 mm² and 40 mm of advance. The measured native volumes agree within `7.4e-9 mm³`.

- **PASS, Model controls and affected checks.** Both windings and original rail correspondence pass. A concave quadrilateral and quadrilaterals with an interior or boundary axis still refuse the compact fit. The established rectangle and triangle controls pass. 43 Model tests, 38 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Direct single-sketch quadrilateral authoring, reviewed Agent authoring, STEP exchange for this quadrilateral path, quantitative viewport quality, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep captures and project files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/trapezoid" --trapezoid
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/quadrilateral" --skew-quadrilateral
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/{loft,loft-rectangular-turn}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```

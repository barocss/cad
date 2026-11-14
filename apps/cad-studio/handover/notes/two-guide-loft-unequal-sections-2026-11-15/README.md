# D1280 — Loft between rectangular sections of different sizes

2026-11-15 · FEATURE · P5, rows 07 and 08

The two-guide Loft accepts different widths and depths on its axis-aligned XY rectangles. The authored guide chord controls the intermediate width and direction. The perpendicular span has length equal to the chord length times the linearly interpolated depth-to-width ratio. When that ratio changes, the opposite edge curves and side patches use exact cubic coefficients. The two authored guide edges retain their original quadratic coefficients. Equal ratios keep quadratic side patches. The projected width and depth must stay above the native minimum, certified by their Bernstein coefficients.

- **PASS — desktop Studio.** Created the Loft from a 10 × 6 mm rectangle and a 14 × 4 mm rectangle 12 mm apart. Selected both direct curves and applied the preview. Edited the second guide middle X from 16 to 18 mm. Both cap profiles and the first guide were retained. Undo, Redo, native Save and fresh Open passed. Reviewed three screenshots.
- **PASS — independent geometry.** For fractional height `t`, the two widths are `10 + 8t − 4t²` and `10 + 12t − 8t²`. The depth is width times `3/5 − 11t/35`. Integrating the section polynomials gives volumes of `29016/35` and `161272/175 mm³`. Studio and the native inspector agreed within `2e-13 mm³`, and matched the centroid and diagonal inertia computed from the section moments. The result remained one strict closed solid with six faces. Five sampled heights verified both original guide contacts and all four side patches. The native Kernel tests also verified rotated slices, reciprocal pcurves, the full inertia tensor and the accepted depth-only change.
- **PASS — regressions.** The D1277 stale proposal still refuses when the moved corner no longer meets the old guide. It now explains the endpoint mismatch. D1279's congruent Loft with a through Hole passed again. Kernel fast build, both type checks, 99 Kernel tests, 37 Model tests, lint and code shape passed.
- **FAIL, corrected.** Initial lint flagged a test decimal with more digits than binary64 retained. The final runs passed with reference values expressed to twelve decimal places.
- **NOT_RUN.** Full local suites, mobile, paid inference, nonrectangular or tilted end sections, and STEP exchange of the new taper.

## Commands and evidence

Node 22.19.0. The gate serialized the heavy checks. The desktop run checked 903 frozen files with no page errors, console errors, or source writes. Receipt SHA-256 `163c34891d3f841a02c16d2aee0e5df942d389a768c6aca94de0b7ba4ef788ac`. Saved `.bcad` SHA-256 `a6f71f4b3d9fb74b04de6031a30900403094564526e1be9d93486efacbfdda26`. Edited and reopened native inspection SHA-256 `ccf6499e93f70e849921152d3502f37f231fbd02d6bbec93c671fe6d378ce18b`.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast)
(cd packages/barocss-cad && node --test --test-concurrency=1 test/loft-{two-guides,nurbs-guide,cubic-guide,guide-control-range,multi-conic}.test.mjs test/oriented-loft.test.mjs)
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test loft proposals
node packages/barocss-cad/scripts/code-shape.mjs --check
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs <external-evidence>
D1277_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-rebase-browser.mjs <external-evidence>
D1279_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-hole-browser.mjs <external-evidence>
git diff --check
```

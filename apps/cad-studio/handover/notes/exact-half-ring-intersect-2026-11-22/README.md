# D1677 — Retain measurable circular rims after intersecting an Exact Sweep ring

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `015b4151b9b41eca37e425ac75f1c8235428ef00`

The native Intersect result keeps both separated circular caps and the original toroidal supports. For the closed circular Exact Sweep and a rectangular box with one transverse clipping face through the ring axis, certify the uncut support coefficients, clearance from the other five box planes and the existing Boolean topology. Replace each accepted trim with the corresponding exact rational isocurve. Bind its canonical parameter to both adjacent face charts. The one-sided derivative check uses the original quarter patches only when their common point and derivatives agree at the knot. If the certificate fails, the existing Boolean result is retained. The general surface derivative policy stays in force.

- **FAIL, base.** The Studio Intersect already produced one valid half ring and two selectable circular caps. Native bindings were missing on every joint. Actual Studio reported “A face has no native parameter curve” for both a bend seam and a cap rim in each case. The baseline reproduction executed successfully and recorded a failed continuity measurement. Driver retries fixed a ray assertion that did not allow a miss and a locator for the text inside Measurement detail.
- **PASS, native geometry.** Both desktop fixtures retain one strict genus-zero solid with six faces, ten edges and the original toroidal supports. Two cap centers lie at `(0, ±20, 0)` mm. Each rim remains rational quadratic and closes around its cap. All 20 coedges have bindings. The largest surface and rim residuals at Ø4 are 7.11e-15 and 9.33e-15 mm. The largest sampled bend-seam angle is 2.28e-13° and deviation from 90° at a rim is 2.84e-14°. Kernel checks also cover a clip on the original support seam, reversed operands, a true one-sided derivative mismatch, and the retained behavior of an offset cutter.
- **PASS, actual desktop Studio WebGPU.** On aligned and 29° rail fixtures, create the box and use Intersect. Select both caps independently in Left view. The seam measures 0° and the rim 90° with eight native samples at each measurement. Edit the original Sweep diameter from 4 to 6 mm. After Undo, Redo, Save and fresh Open, both measurements and the Sweep editor are available. The aligned local Agent rejects a stale revision. Its valid dry run leaves the file bytes untouched. Explicit Studio approval reproduces the same native result as direct Intersect. The existing Exact elbow box Intersect and inlet Fillet control passes with 9 captures. Its recorded native digests, volumes and topology match D1672.
- **PASS, affected checks.** Kernel 48, Model 9 and Studio 12 tests. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check pass. The frozen browser runs record zero source changes, page errors or console errors.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same excess as before in `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts`.
- **NOT_RUN.** Full local suites, WebGL2, a subsequent Fillet of the half-ring rim, arbitrary cutter intersections and the live provider. Keep #10 open.

For rail radius R and section radius r, the independent volume is π²Rr². The centroid in the retained normal direction is 2(R² + r²/4)/(πR). The verifier compares the independent values with the native mass calculation, quadrature and the Studio worker.

| Rail orientation | Base Ø4 volume (mm³) | Verified Ø4 volume (mm³) | Base maximum cap-plane error (mm) | Verified error (mm) | Native bindings | Verified Ø6 volume (mm³) | Captures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aligned | 789.568352059956 | 789.568352059761 | 1.9e-13 | 3.55e-15 | 20 | 1776.528792137204 | 13 |
| oblique | 789.568352104260 | 789.568352041393 | 4.79e-09 | 4.08e-15 | 20 | 1776.528792096718 | 11 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git. The baseline uses the driver with `--expect-missing-binding` against the base kernel. The output records unsupported results as the expected baseline failure. The final driver checks measurement again after fresh Open.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/{analytic-boolean,edge-continuity,exact-ring-intersect}.ts test/exact-ring-intersect.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-ring-intersect,exact-closed-circle-sweep,exact-elbow-sweep,exact-rectangular-duct-sweep,edge-continuity,analytic-boolean,boolean-face-sources,freeform,arc-sweep-bore-fillet}.test.mjs
pnpm exec eslint apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs
node --check apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1677_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/aligned" --local-approval
D1677_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/oblique" --oblique
D1672_SOURCE_FROZEN=1 node apps/cad-studio/test/elbow-inlet-fillet-browser.mjs "$OUT/elbow"
git diff --check
```

# D2141 — Draft exact acute circular sectors

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `e8ecb8e4200fa7d51943156742c79a4940170413`.

An original acute minor arc with two radial walls can now take either sign of Draft Extrude. The admission proof uses exact binary endpoint lengths and orientation. The offset walls meet along a line. Each wall meets the circular cone along a quadratic parabola. The producer uses the circular sector's bisector to keep both cone charts bounded and preserves the authored base vertices and incident curve endpoints. The signed collapse guard requires the turned radial corner to remain inside the top circle.

## Verification

- **PASS, baseline.** Actual Studio refuses the 53.130102° sector at +10° Draft with the existing nontangent-joint diagnostic. The original profile remains intact.
- **PASS, desktop.** Studio previews, cancels and applies +10° on the 10 mm radius, 10 mm height sector. History refuses +20° and −40° with the prior document retained. Applying −10°, Undo, Redo, native Save and fresh Open preserves the resulting feature and boundary. Both frozen runs cover 1,279 files with zero source changes, page errors or console errors.
- **PASS, independent geometry.** For each level use offset `d`, `q = sqrt(R² − 2Rd)`, half-angle `a` and section area `(R−d)²(a−atan2(d,q)) + 2d² − dq`. The independent integral gives 252.36192253802574 and 767.5866568647912 mm³. Studio and the native volumes match within 8e−9 mm³. The six-face solid has two quadratic radial seams and one straight radial corner. Native checks retain exact authored endpoints and agree with the independent centroids. A translated, rotated and reversed control passes. Both signs tessellate watertight at 4, 8 and 16 segments per quarter. The reopened −10° boundary digest is `f1064afb0e8736dd1b10fa6eda3d9cc596c0c2bc29a8a1e9ca13ad6c2ba86960`.
- **PASS, affected checks and independent review.** 89 Kernel, 3 Model and 99 Studio tests, all types, scoped lint, driver syntax, diff check and production build on Node 22.19.0. Substituting the previous native producer fails the acute regression. Four signed cardinal and rotated quadrant native digests match the previous producer. The final type-only import produces identical emitted JavaScript to the Studio-tested source.
- **FAIL, corrected checks.** The first native assertion expected stored pcurves. This producer evaluates the exact 3D boundaries on their supports and the original quarter producer also has no stored pcurves. The final strict test checks edge/surface error below 1e−10 mm. The first type check found a missing type-only import.
- **NOT_RUN.** Obtuse or major-arc source profiles, explicit pcurve creation, external formats and readers, mobile and full local suites. The broader Draft issue remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run desktop and affected checks under the heavy gate.
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --baseline --acute
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/final" --acute
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-quarter-disk,drafted-half-disk-outward,drafted-circular-segment,drafted-oblique-circular-segment,drafted-major-circular-segment,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude-draft-binding offset-drafted-wall extrude-reviewed-draft
pnpm --dir apps/cad-studio test draft extrude proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

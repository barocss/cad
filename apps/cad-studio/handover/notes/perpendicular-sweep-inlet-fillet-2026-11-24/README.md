# D1917 — Preserve a perpendicular Exact Sweep through inlet Fillet

P5 [row 07](../../roadmap-rows/07.md), [row 08](../../roadmap-rows/08.md) and [row 30](../../roadmap-rows/30.md), [#10](https://github.com/barocss/cad/issues/10). Base `4fe22307d09187928012e892402bfad008889097`.

Use the existing exact constant circular Fillet on the original inlet bore of the D1916 annulus. Apply the inherited circular binding check after the closed-form tool cuts the solid. For a perpendicular torus pair, verify the original and current native carriers, the full rational boundaries and the directed coedge uses. Bound the radius by the proven wall of the original concentric annular inlet. Keep the existing overflow policy for other edges.

- **FAIL, previous desktop Studio.** One actual pick and R0.20 Apply gave 632.571412455701 mm³ and a valid genus-1 shell. All 12 original circular joins lost both pcurves. The continuity tool could not measure them. R2.00 gave 626.0496284820543 mm³ and removed the original inlet cap despite its 1 mm radial wall.
- **PASS, current desktop Studio.** A single rim pick expands to both original semicircles. R2.00 refuses with the same selection, document and History. R0.20 applies. History changes it to R0.25. Undo, Redo, native Save and fresh Open retain the accepted result. The Studio continuity panel measures 0° on each of the twelve original circular join edges after Open. Eight new checkpoints and nine actual checkpoints on the prior spaced Sweep control pass.
- **PASS, independent physical checks.** The original meridian removes a square less a quarter disk. Its volume and first moments give 632.5714124556997 and 632.5387772959402 mm³. The native results are 632.571412455701 and 632.5387772959418 mm³. At R0.25 the centroid is (8.26403124906138, 15.577669150783938, 6.163918763737712) mm. The maximum native edge gap is 3.98e−15 mm. Four contact arcs lie on the exact original bore and cap planes or cylinders. Both annular end caps survive. Native controls cover an equal or near-contact wall, bore editing, reciprocal pcurves, transposed charts and rejection of altered or ambiguous carriers.
- **FAIL, initial new tests.** Six new fixtures used a bare string for a native parameter reference. The test fixture now uses the existing object syntax. Those six cases pass on the same production source. The 28 existing native tests had passed in the first run.
- **PASS, affected checks.** 34 native cases across the existing and corrected focused runs, 23 Model and 18 Studio tests. Both package type checks, scoped lint, Studio production build, driver syntax and Git diff check pass.
- **NOT_RUN.** Variable or noncircular Fillet, other caps and section families, downstream general Boolean, arbitrary frame laws, full local suites, mobile and paid providers. The first mechanical CAD baseline remains 8/10. Overall completion remains unmeasured. #10 stays open.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-perpendicular-bore-fillet,exact-spaced-bore-fillet,arc-sweep-bore-fillet,exact-half-ring-fillet,r10-1,r10-2,r10-b,r10-reach}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test api-face-fillet api-variable-fillet finish-limits arc-sweep-display sweep-path-history edge-continuity
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope history-fillet-radius-receipt
D1917_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-bore-fillet-browser.mjs "$OUT/baseline" --baseline
D1917_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-bore-fillet-browser.mjs "$OUT/studio"
D1724_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-bore-fillet-browser.mjs "$OUT/spaced-control"
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

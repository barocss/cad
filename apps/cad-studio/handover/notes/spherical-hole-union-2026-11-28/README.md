# D2122 — Tessellate the original spherical trim in both Union orders

P5 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `ea5b160374e569f32f7f844638b18aa5be2ca2e4`.

The retained commutativity entry `20261024:125@r.b` recreates the asymmetric failure. The native Boolean returns a strict one-shell solid in both orders. The disk cap faces tessellate. The nearest visible bridge for a hole on one spherical chart doubles back nearly along its lower trim. When ear clipping exhausts that ring, the surface path retries a rightward visible bridge. Admission requires simple, disjoint rings. The retry must then retain every directed boundary segment, use interior segments in opposite pairs, and emit no clockwise triangles. The default bridge chooser, native boundaries, and tolerance values stay as in the base. Retire the resolved entry in the commutativity ledger.

- **FAIL, reproduced base behavior.** In actual Studio, select the cut cylinder first and then the sphere. Union reports `Planar face could not be triangulated` and retains the original two bodies and 12 nodes. Sphere-first commits one resulting solid. Independent source review locates the error in the spherical face's parameter polygon, with nonzero hole area and a bridge only about 3.22 × 10⁻¹⁰ chart units from its nearly collinear lower edge. Cycling all 34 starting vertices, with and without the ear-size cost, leaves the base case unresolved.
- **PASS, actual desktop.** Both original selection orders commit the authored Union, Undo restores two inputs, and Redo restores the result. Native Save and fresh Open reproduce `afe4a5ebb44f0a06e26c3b440c37af61cce257a71bf89fbc739b144166e20ec6` and `5b2a0ced63b5a97441d660b233dbc562a2a4e3661c2dad2da26ebd4ec7ba27b3`, respectively. The Studio Worker agrees with the direct native volume for each order. Both desktop runs report zero changes to the 1,272 frozen source files and zero runtime or console errors.
- **PASS, independent shape and native identity.** In each horizontal section within Z = [−2,−1], integrate the disk of radius 4 centred at (3,1) outside both sphere sections. The sphere centres are (0,3,0) and (−1,−3,−2), and their radii are 4 and 3 mm. Split the X integral at circle extrema and pair crossings, subtract the union of their Y intervals from the cylinder Y interval, and integrate through the slab. Add the full radius-3 sphere, 36π mm³. Adaptive Simpson refinement from 10⁻⁷ to 10⁻⁹ changes the estimate by less than 5 × 10⁻¹¹ mm³, to 140.7123325734261 mm³. The candidate's quadrature gives 140.71233251003338 and 140.71233251070245 mm³. Both are within 1 × 10⁻⁶ mm³ of the independent estimate. Both native results contain one solid, one shell, six faces and seven loops. Mesh edge use is watertight at 4, 8 and 16 segments per quarter turn. Each raw corpus result has the same serialized native boundary as its respective pinned baseline.
- **PASS, affected checks.** 180 Kernel tests, a mutation that restores unrestricted bridge selection in the retry, Kernel/Model/Studio type checks, scoped ESLint, browser driver syntax, Studio production build and diff check on Node 22.19.0. The mutation fails the new regression with the same triangulation error.
- **FAIL, inherited code shape.** The broad checker reports the same six findings in unrelated files on the exact baseline and the candidate. No finding names the changed tessellator. The candidate reduces the overall loop-spread count from 275 to 274.
- **NOT_RUN.** Full local suites, full seeded commutativity and fuzz campaigns, helical-gear SSI, mobile and live providers. The broader [#7](https://github.com/barocss/cad/issues/7) acceptance remains open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/brep-*.test.mjs packages/barocss-cad/test/boolean-*.test.mjs packages/barocss-cad/test/{analytic-boolean,api-part}.test.mjs
UNION_SPHERE_CUT_FROZEN=1 node apps/cad-studio/test/spherical-hole-union-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/code-shape.mjs --check
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

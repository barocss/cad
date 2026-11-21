# D1582 — Build a compact external-axis Screw from a line and circular arc

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `52f978f25ef32db5ba6288bf920085ba65175465`.

Admit a single closed line and circular arc with matching authored correspondence, section spacing and signed rotation. Require the axis to clear the full supporting disc at every station. Fit one signed cubic rotation and affine height for all controls. Preserve the first section's rational weights and use matching cap and wall boundaries. Keep distinct native names for both rails when the arc needs only one wall.

The rational arc stays on a circle at each height. The compact cubic rotation can change its radius slightly between stations. The volume oracle includes this change.

- **FAIL, previous desktop Studio.** Smooth Loft refused both signed 13-section inputs with `Surface V control point count must be in 2..16`. Apply stayed disabled, the document stayed exact, and no solid appeared.
- **FAIL, first short-arc implementation.** The 30° native range control detected a shared adjacent-face name on two distinct rails. The final 4-face cases pass strict naming with distinct stable rail names.
- **PASS, actual desktop WebGPU.** Preview, Apply, Save and fresh Open both 120° circular segment inputs at ±360° over 40 mm. Each result is one closed strict solid with 5 faces, 9 edges, 6 vertices and 3 shared cubic rails. The saved document and native digest match exactly after each fresh Open. The source sketches match the baseline exactly. All 121 sampled parameters on each rail have the intended signed winding. The maximum authored rail station error is 1.586e-9 mm. Across the two quadratic arc walls, the largest station circle or plane error is 1.245e-9 mm, the shared seam gap is zero, and the largest unit tangent difference is 1.252e-14.
- **PASS, independent volume.** The analytic area is `r²(φ − sin φ)/2 = 5.5276636437394036 mm²`. Solve the 13-sample unit-circle interpolation independently with cubic de Boor evaluation and a pivoted solve. Integrate its squared magnitude over each knot span by four-point Gauss quadrature, then multiply by the area and height. The expected volume is 221.13498549200997 mm³. Studio gives 221.1349854137824 and 221.1349854137831 mm³, within 7.823e-8 mm³.
- **PASS, native controls.** Both windings pass strict checks on arcs of 30°, 60°, 90°, 120°, 180°, 210°, 270° and 320°. The maximum volume difference from the same independent integration is below 4e-12 mm³ on those direct Kernel fixtures. Tests reject an interior axis, irregular height and rotation, and a changed arc centre with unchanged endpoints. The regressions detect both temporary mutations, bypassing disc clearance and removing the two-rail name suffix.
- **PASS, affected checks.** 7 focused Kernel, 43 Model and 38 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Single-sketch Smooth Screw command for this profile, STEP round trip, renderer comparison, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep independent solver output, mutant copies and Studio captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/smooth-rectangular-turn.test.mjs
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/{loft,loft-rectangular-turn}.ts packages/barocss-cad/test/smooth-rectangular-turn.test.mjs apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/studio" --line-arc
git diff --check
```

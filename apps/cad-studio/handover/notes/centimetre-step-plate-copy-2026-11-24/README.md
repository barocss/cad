# D1846 — Reconstruct an SI centimetre STEP plate in millimetres

P2 [row 13](../../roadmap-rows/13.md) and P5 [row 31](../../roadmap-rows/31.md), [#320](https://github.com/barocss/cad/issues/320). Base `8026214a77b57effcae9e7e5fb52b97cbcf42d5d`.

The exact AP214 bored plate now supports the active SI centimetre context. The verifier follows the solid's representation to its linked unit context. A single active centimetre length unit is required. Only 3D point coordinates, LINE vector magnitudes and length uncertainty are converted in the raw comparison. Curve knots, spline weights, reference sharing and topology remain part of the exact key. The match uses millimetre binary64 values and refuses any collision of distinct source lengths. Unlinked length units, mixed declarations and a different imported Scale are refused.

Studio retains the original Import and origin-pivot Scale ×10. The separate candidate contains Sketch, Extrude and Hole at the physical millimetre dimensions. The candidate needs no Scale. The local CLI uses the same certification and records the input unit.

- **PASS, equivalent source.** A decimal conversion of the D1842 geometry-only plate gives 4 × 3 × 1 cm input with a Ø0.6 cm bore at (1.1, 0.9). The comparison changes the spatial point records, vectors and uncertainty by 1/10. It uses the active SI centimetre record. The validation volume and area scale by 1/1000 and 1/100. Both source files open through actual Chrome WebGPU. Their 40 × 30 × 10 mm bounds, volume and centroid agree within `1e-8` in millimetre units. Native volumes are 11717.256661177 mm³ to nine decimals.
- **PASS, editable copy.** Actual CLI review yields the same candidate digest for millimetre and centimetre sources and different source-bound review IDs. Actual Studio Save copy from the centimetre source yields byte-identical BCAD. The named values are 10, 11 and 9 mm. The same `plateThickness` driver changes to 14 mm, and Save plus fresh Open preserve the bore and volume 16404.159325648 mm³. The source file and document stay unchanged.
- **PASS, refusal.** Studio opens a file with a changed LINE carrier through the ordinary path, but the editable review disables Save and preserves that document. The real CLI refuses it. Focused checks also cover a different Scale, the wrong active context, extra length declarations and a centimetre Shaft outside this slice.
- **PASS, affected checks.** Kernel fast build, five Kernel STEP tests, 22 Model and 23 Studio tests. Kernel, Model and Studio types, Studio production build, scoped ESLint and Git diff check. Studio captures five states; all 1,208 frozen files agree with zero page, console and source-change errors.
- **FAIL.** None observed.
- **NOT_RUN.** Conversion-based inch, other units or STEP representations, centimetre Shaft expansion, external reader, other render modes, mobile and full local suites. #320 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/step.test.mjs
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy shaft-display step-units step-reference-units
pnpm --dir apps/cad-studio test editable-step-cli editable-step-preparation step-export
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$CM_STEP" --named
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$CM_STEP" --named --review "$REVIEW_ID" -o "$CLI_COPY"
D1846_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-centimetres-browser.mjs "$OUT/studio" "$FIXTURES"
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

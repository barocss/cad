# D2126 — Use the authored circle nominal on its original drawing rim

P2 [row 11](../../roadmap-rows/11.md) and [row 16](../../roadmap-rows/16.md) · [#35](https://github.com/barocss/cad/issues/35) · Base `4ab98d5b2270d4a750b8450e10a345d5c21bf9db`.

The evaluated circle stores its resolved centre and radius in its in-memory sketch reuse key. For an unplaced zero-draft Extrude, the original hole-free prismatic loop must have the same radius and centre on every arc. The prismatic producer then binds the authored radius to each actual horizontal arc edge ID in the resulting B-rep. Drawing diameter and radius values use that authored number. Projected ink still uses the geometric curve. A distinct B-rep, transformed or changed Boolean output, serialized boundary, or a radius rounded out of the original loop uses the existing geometric measure. An exact object alias retains the known source value.

- **FAIL, reproduced base behavior.** The actual Top drawing takes its native reconstructed radius of 6.3500000000000005 mm as nominal and obtains Ø12.700000000000001. A symmetric ±0.254 mm tolerance appears with stacked limits `+0.254/-0.253` in mm and `+.010/-.009` in inch.
- **PASS, actual desktop.** The identical seed and target now display `Ø12.7 +0.254/-0.254` and `Ø.500 +.010/-.010`. The drawing Undo/Redo, native Save and fresh Open preserve those limits. The actual reopened Model Diameter edit changes the drawing value to exactly 14 mm. Undo returns exactly 12.7 mm and the original inch labels. The final run freezes 1,274 source files with zero changes, runtime errors or console errors.
- **PASS, native ownership and independent decimal bounds.** In the first fixture the actual cap arcs still reconstruct to 6.3500000000000005 or 6.350000000000001 mm. Every original cap arc carries the 6.35 mm nominal. A strict native read agrees with volume `π × 6.35² × 10` mm³. Independent decimal arithmetic checks the printed endpoints against [12.446,12.954] mm and [.490,.510] inch. Four native B-rep digests, including a parameter-rounding pair at X = 8192 mm, match the pinned baseline. The rounded pair produces identical geometric records. A radius of 1 mm has the receipt and the next binary64 radius has no receipt, even after reuse. The previous snapshot still has its receipt. A copied, translated or cut B-rep falls back to the geometric radius.
- **PASS, affected checks.** 74 Kernel, 57 Model and 23 Studio tests, the prior producer mutation, Kernel/Model/Studio types, scoped ESLint, Studio production build, driver syntax and diff check on Node 22.19.0. Restoring the previous producer fails the original-arc provenance assertion.
- **FAIL, corrected inspection.** The first fixture expected JSON key order and used a 2D value for the 3D circle anchor. The fixed seed uses the exact native projected centre and compares the record. Later assertions expected inline tolerance text and omitted the source signature stored by the actual Model edit. The final run verifies the two separate visible limits and the saved curve signature.
- **FAIL, inherited checks.** The drawing-units golden produces the same 18 hashes on the pinned baseline and the candidate, including all six dimension-data hashes. The broad code-shape checker reports the same six inherited findings and counts as D2122. The inspected golden files were left as recorded.
- **NOT_RUN.** PDF, H7 class and imported table priority, other advanced nominal producers, broad local suites, mobile and live providers. The remaining [#35](https://github.com/barocss/cad/issues/35) acceptance is open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
AUTHORED_CIRCLE_NOMINAL_FROZEN=1 node apps/cad-studio/test/drawing-authored-circle-nominal-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
AUTHORED_CIRCLE_NOMINAL_FROZEN=1 node apps/cad-studio/test/drawing-authored-circle-nominal-browser.mjs "$OUT/verified"
node --test --test-concurrency=1 packages/barocss-cad/test/{authored-circle-nominal,brep-hidden-line,prismatic-solid,part-model,api-part}.test.mjs
pnpm --dir packages/barocss-cad-model test drawing-tolerance-printable drawing-diameter-read drawing-cylinder-diameter drawing-units drawing-made-views drawing-arc
pnpm --dir apps/cad-studio test drawing-dimension-group drawing-dimension-changes drawing-dimension-comparison-ui
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

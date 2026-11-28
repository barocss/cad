# D2144 — Create a Sketch Chamfer with two distances

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#171](https://github.com/barocss/cad/issues/171) · Base `e19908ceb77a4f6fd14aeaa724763f8e9d59d083`.

Sketch Chamfer offers two distances at one supported corner between perpendicular straight sides. The preview uses the existing outline and solver. Apply stores the bevel as an existing line length and signed angle. Equal distances retain the original model. Batch and oblique paths retain their existing equal-distance controls.

## Verification

- **PASS, actual desktop baseline and candidate.** The baseline exposes one distance on the selected right-angle corner. The candidate previews incoming 3 mm and outgoing 4 mm without changing the committed 12,000 mm³ extrusion. An outgoing distance of 30 mm is refused. Cancel restores the original preview. Apply and Finish cut the corner at (37, 0) and (40, 4) of the 40 × 30 mm rectangle. Its 10 mm extrusion measures 11,940 mm³. Undo/Redo and native Save/fresh Open preserve the expected geometry. The independent native read finds one solid, seven faces and the same vertices after Open.
- **PASS, existing edit and controls.** After Open, changing the existing bevel line length from 5 to 10 mm preserves the signed angle of 126.86989764584402° and scales the setbacks to 6 and 8 mm. The native solid measures 11,760 mm³. The desktop control covers the existing equal-distance Chamfer and Fillet. The two new browser runs freeze 1,280 files each and the control freezes 1,281. All report zero source changes, page errors and console errors.
- **PASS, affected checks.** 61 Model and 55 Studio tests pass. Model and Studio types, scoped ESLint, driver syntax, diff check and Studio production build pass with Node 22.19.0. The Model tests also verify swapped setbacks, signed reflex and clockwise geometry, and refusal on unsafe or unsupported corners.
- **NOT_RUN.** Dedicated independent edit of a saved two-distance chamfer, unequal distances on batches or oblique carriers, external CAD, mobile and full local suites. #171 remains open. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/final"
D1691_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-browser.mjs "$OUT/equal-control"
pnpm --dir packages/barocss-cad-model test sketch-chamfer-retention corner-batch sketch-chamfer-edit corner
pnpm --dir apps/cad-studio test constraints sketch-constraint corner
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

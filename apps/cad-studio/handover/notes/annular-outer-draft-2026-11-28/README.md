# D2224 — Draft the original outside wall of a coaxial annular extrusion

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `e8c108a4c`.

Draft accepts both native halves of the exterior on the original literal, unplaced XY coaxial annular extrusion. Positive Draft reduces the outside radius along the signed pull. The bore keeps its original surface, world boundaries and wall trims. Each changed cap has its own exact planar chart with both loops reprojected. The neutral cap retains its original chart.

- **PASS, actual desktop.** The baseline rejected the exterior pick. The revised preview kept the source through Cancel. Draft that met the retained bore refused Apply. On R12/R4 stock between Z3 and Z19, +8° about Z9 measured 6,120.044512 mm³; History at −8° measured 6,798.222386 mm³. Independent radii, volume and centroid agreed. The two bore surfaces, fixed edges and wall pcurves matched their original records. Both cap planes stayed in place. Undo, Redo and project Save → Close → reload → Open preserved the result.
- **PASS, affected checks.** 110 Kernel and 24 Model focused tests, scoped lint, Kernel/Model/Studio types, production Studio build and whitespace. Native checks cover both pull and angle signs, interior and end neutral stations, complete cap pcurves, fixed bore records, mass, area, material rays and prior Draft and Offset controls. The local Model command dispatch selects the original exterior by its two native names.
- **FAIL, existing source-shape guard.** The same eight entries appear as in the parent. The scanned sources, baseline and script match the parent.
- **NOT_RUN.** Placed or downstream stock, combined Draft of both walls in one feature, exchange, full local suites, mobile and live models. Existing cone Offset limits remain. #14 retains its wider acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

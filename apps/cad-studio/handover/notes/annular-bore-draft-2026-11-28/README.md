# D2223 — Draft the original bore of a coaxial annular extrusion

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `e848be707`.

Draft accepts both original native halves of the inner cylindrical wall on one literal, unplaced XY annular extrusion. The pull is +Z or −Z. A positive angle widens the bore along the pull direction. The wall is an exact ruled rational cone between the original cap planes. The original outside surface and outer boundaries retain their native records. The cap charts keep their outer loops and reproject only the changed inner trims. The general face inspector reports the cone in its existing `other` category.

- **PASS, actual desktop.** The baseline rejected the actual bore pick. The revised Draft preview used both halves and kept the source through Cancel. Axis collapse and outside-wall contact refused Apply. On R12/R4 stock between Z3 and Z19, +8° about Z9 measured 6,295.800414 mm³; History at −8° measured 6,521.859706 mm³. The independent radius law, volume and centroid agreed. Undo, Redo and project Save → Close → reload → Open preserved the signed edit and the exact original outside supports.
- **PASS, affected checks.** 102 Kernel and 23 Model tests, lint, Kernel/Model/Studio types, production Studio build and whitespace. Native tests cover both pull and angle signs, neutral stations, pcurves, material rays, watertight mesh, exact source ownership and prior Draft/Offset controls. The local Model command dispatch selects the same two native names.
- **FAIL, initial checks.** The baseline driver initially looked for an orientation property that the display packet omits. The first unsupported fixture used a fixed interior neutral and reached a prior neutral refusal. The first fixed driver expected a cone enum from the general face inspector. Corrected checks used the actual bore names, default neutral for the unsupported-source check and independently sampled native surfaces. The source-shape guard reports the same eight entries as the parent. Its scanned inputs match the parent.
- **NOT_RUN.** Outer-wall draft on annular stock, placed or downstream bored stock, external exchange, full local suites, mobile and live models. Existing cone Offset boundaries remain. #14 retains wider acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh" before annular-bore-draft
bash "$OUT/checks.sh"
bash "$OUT/remaining-checks.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

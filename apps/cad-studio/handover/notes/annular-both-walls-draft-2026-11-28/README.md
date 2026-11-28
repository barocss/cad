# D2226 — Draft both walls of an original coaxial tube

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `6f5d82eda`.

Select the complete inside and outside walls of the original literal, unplaced XY annular extrusion. One Draft turns all four native halves about a shared neutral plane. A positive angle narrows the outside and widens the bore along the signed pull. The producer combines the two edits from the same original solid. Each changed cap uses its final outside chart for both pcurves. A neutral cap at an original end keeps its exact record. The two end stations bound the minimum wall thickness and bore radius.

- **PASS, actual desktop.** The original Studio rejected the two wall picks. The revised build previews both walls. Cancel keeps the source. At +15° from the bottom, Apply is disabled and the current document is preserved because the walls would meet. On R12/R4 stock between Z3 and Z19, +8° about Z9 measures 5,981.863171 mm³ and History at −8° measures 6,886.100338 mm³. Both frustum radii, volume and centroid agree with an independent calculation. All four conical surfaces follow the expected radius law. The strict native check reports one solid, one closed shell, genus one and original incidence. Undo, Redo and project Save → Close → reload → Open preserve the result.
- **PASS, affected checks.** 118 Kernel tests, 25 Model tests, scoped lint, Kernel/Model/Studio types, production Studio build and whitespace. Native coverage includes both pull and angle signs, neutral cap bytes, exact projected cap trims, material rays, a joint contact that either single-wall operation accepts, and prior Draft and Offset controls. The local Agent command selects the same four halves from the two wall names.
- **FAIL, existing source-shape guard.** The eight outputs match the parent. Script, baseline and scanned sources match the parent. An initial guard invocation with the host Node 18 failed before scanning. Its Node 22.19.0 rerun produced the unchanged eight entries.
- **NOT_RUN.** Placed or downstream stock, exchange, full local suites, mobile, paid live models and performance. #14 retains its wider acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD and live natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

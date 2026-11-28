# D2230 — Set independent floor and ceiling on a closed cylinder Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `2b5ed484c`.

One original literal, unplaced XY circular extrusion can use **Separate floor and ceiling** in closed Shell. The existing Wall sets the radial thickness. The two cap inputs set the two cavity stations. The source outside walls and caps retain their ownership. The cavity has exact inward cylindrical walls, opposing cap normals and two named circular cap loops. The feature uses the existing Shell fields and closed-solid format.

- **PASS, actual desktop.** The baseline had only uniform Wall. Preview and Cancel preserve the original part. On R15 stock between Z3 and Z23, Wall 2 mm and floor/ceiling 3/5 mm give 7,766.017040 mm³ and the cavity lies between Z6 and Z18. The two caps meeting and a wall that reaches the axis both refuse Apply and keep the source. History changes the floor to 4 mm, then the ceiling to 6 mm. The final solid measures 8,827.875357 mm³ with an R13 cavity between Z7 and Z17. Independent volume and centroid agree. The final native model has one solid, two closed shells and four preserved or named cap planes. Undo, Redo, project Save → Close → reload → Open and the exact section pass.
- **PASS, affected checks.** 79 Kernel, 16 Model and 47 Studio tests. Native coverage includes the cap and wall supports, circular trim ownership, fractional source dimensions, physical section and material rays, valid readback, limit refusals and prior Shell controls. The revision-pinned local Agent command returns the same Shell feature as the Studio command. Scoped lint, affected types, production Studio build and whitespace pass.
- **FAIL, first Kernel type check.** The circle centre is readonly. The corrected signature emits identical JavaScript and passes final types and actual Studio.
- **FAIL, existing source-shape guard.** The same eight entries appear as in the previous geometry delivery. Script, baseline and scanned sources match this parent.
- **NOT_RUN.** Openings with independent caps on a cylinder, placed or downstream cylinders, general freeform Shell, exchange, full local suites, mobile and paid providers. #13 retains its wider acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
bash "$OUT/final.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

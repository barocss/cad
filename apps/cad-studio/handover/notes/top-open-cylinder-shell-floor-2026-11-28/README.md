# D2231 — Set the floor of one top-open cylinder Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `6d7bba512`.

Select the original top face of one literal, unplaced, zero-draft XY circular extrusion. **Separate floor** sets the floor independently of the radial Wall. The cavity ends at the original top station. The original top remains an annular rim with exact inner and outer trims. The named inner floor has its own support. Moving the cylindrical admission and producer to their own module reduces `part-shell.ts` from 769 to 670 lines.

- **PASS, actual desktop.** The original top-open cylinder showed only uniform Wall. The new mode previews at Wall 2 mm and floor 3 mm. Cancel preserves the source. A floor that fills the cavity and a wall that reaches the axis both refuse Apply. For R15 stock from Z3 to Z23, floor 3 mm measures 5,111.371247 mm³. History changes only the floor to 4 mm and measures 5,642.300406 mm³. The original rim stays at Z23. Independent mass and centroid, one strict closed shell, both top trims, Undo/Redo, project Save → Close → reload → Open and the exact section pass.
- **PASS, affected checks.** 86 Kernel, 17 Model and 47 Studio tests, scoped lint, affected types, production Studio build and whitespace. Kernel tests check native supports, material rays, fractional and boundary cases, exact native readback and the D2230 closed cylinder and ordinary open-Shell byte controls. The revision-pinned local Agent retains the original top face signature and produces the same B-rep as the Studio command.
- **FAIL, retained early checks.** The first Model run found an unsupported default corner value in the new circular mode. The mode now supplies only its available fields. The second run expected the raw manual node to contain the same signature metadata as the Agent result. The final test verifies that metadata and compares exact B-reps. The first Model type check required an explicit command values annotation. The corrected type emits identical JavaScript and the final desktop run passes. The source-shape guard still reports the same eight entries with unchanged script, baseline and scanned sources.
- **NOT_RUN.** Separate ceiling on a bottom opening, other openings, placed or downstream cylinders, exchange, full local suites, mobile and live providers. #13 retains its wider acceptance. First mechanical CAD stays at 8/10. Overall CAD and natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
bash "$OUT/continue.sh"
bash "$OUT/final.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

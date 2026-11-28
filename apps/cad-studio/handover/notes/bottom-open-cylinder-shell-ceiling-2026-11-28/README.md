# D2232 — Set the ceiling of one bottom-open cylinder Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `bca264262`.

Select the original bottom face of one literal, unplaced, zero-draft XY circular extrusion. **Separate ceiling** sets the cavity ceiling independently of radial Wall. The original bottom remains an annular rim with two exact circular trims. The single-opening cylinder producer serves both end caps.

- **PASS, actual desktop.** The original bottom-open cylinder offered only uniform Wall. Preview, Cancel, ceiling and radial collapse refusal, Apply, History, Undo/Redo, Save → Close → reload → Open, and the exact section pass. Wall 2 mm and ceiling 3 mm on R15 stock from Z3 to Z23 give 5,111.371247 mm³. History changes the ceiling to 4 mm for 5,642.300406 mm³. The original rim stays at Z3 and the ceiling moves from Z20 to Z19. Independent volume and centroid agree.
- **PASS, affected checks.** 94 Kernel, 18 Model and 47 Studio tests, scoped lint, affected types, production Studio build and whitespace. The strict native checks cover the cavity, trims, support, and parity rays. Existing closed, top-open and uniform bottom-open bytes match their controls. The revision-pinned local Agent retains the original bottom-face signature and produces the same B-rep as the Studio command.
- **FAIL, retained initial checks.** A test used a widened field key in its type annotation. The corrected test and type check pass. The source-shape guard reports its eight existing entries. Its script, baseline and scanned sources match the parent.
- **NOT_RUN.** Other or placed cylinders, freeform Shell, exchange, full local suites, mobile and live providers. #13 retains its wider acceptance. First mechanical CAD stays at 8/10. Overall CAD and natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
bash "$OUT/continue.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

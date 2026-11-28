# D2265 — Finish the original inner rim of a closed trapezoidal Sweep

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#12](https://github.com/barocss/cad/issues/12) · Base `11683752f`.

- **Decision.** Use the existing constant circular Fillet on the exact closed Sweep from D2264. Both halves of the original inner rim carry their native names through the authored width change. The stored match signatures refresh from the source point at X18 to the source point at X17. Production code required no change.
- **PASS, actual desktop.** Headed Chrome picked the original inner rim in the Top view. Fillet showed the two halves in its scope. Preview and Cancel preserved the accepted document. Apply wrote one R0.5 Fillet. Editing the original `BaseWidth` from 4 to 6 mm kept both authored rim owners. Undo, Redo, project Save, Close, reload and Open restored the exact finished B-rep and the editable Fillet radius.
- **PASS, independent shape check.** Both widths give one valid closed genus-one solid with eight faces and sixteen edges. With bore radius `R = 20 − w/2` and Fillet radius `r = 0.5`, Pappus gives removed volume `2π[Rr²(1 − π/4) + r³(5/6 − π/4)]`. The finished volumes are 2,205.5758559529504 and 2,884.496964904943 mm³, within 4e-11 mm³ of the formula. The reopened native bytes match the edited result.
- **FAIL, driver controls.** The second manual Shift pick timed out. The complete original rim then passed through one canvas pick and the existing tangent expansion. Two later driver assertions assumed an exact picked/expanded partition after reopening the command and frozen match signatures after the width edit. The final assertions check the actual complete scope, stored owners and refreshed native signatures.
- **NOT_RUN.** General vertex, setback and multi-face Fillet acceptance. Full local suites for this evidence-only change, mobile and live models.

```sh
bash "$OUT/desktop.sh" owner
git diff --check
```

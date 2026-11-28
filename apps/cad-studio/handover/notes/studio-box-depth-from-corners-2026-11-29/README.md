# D2270 — Match authored Box depth from two current native corners

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `9013dea1b`.

- **FAIL, base capability.** Actual Studio selected the two exact original corners in the documented order and offered no Box depth edit.
- **Decision.** Reuse the existing original Box corner gate and ordinary editable footprint command for the depth axis. The original positive-Y source corner selects the moving plane. The second Box's current native corner supplies the target Y. The original negative-Y face stays fixed, and the edit keeps the source Box command and its feature IDs. The existing width entry uses the same path.
- **PASS, desktop and native geometry.** The actual selected source Y=3.5 moves to the reference Y=9. Depth changes from 8 to 13.5 mm with Y=−4.5 fixed. Strict native volume is 972 mm³. The other Box's complete native record is identical. Same-body picks, reversed roles and the wrong source side offer no depth command. The original 30.5 mm width preview still opens. Depth Preview and Cancel keep the source, and Apply, Undo/Redo and project Save through fresh Open preserve the exact edited native result.
- **FAIL, during development.** The first type check found four existing Selection inspector callers could not omit the new footprint action object. The final optional contract keeps those callers working. The affected tests and the final actual Studio flow rerun.
- **PASS, automated.** Node 22.19.0 passed 13 Model and 65 Studio cases. Studio types, changed-file lint and the production build passed.
- **NOT_RUN.** Other source faces, relationships that update after the reference moves, placed parts, mobile, live models and the full local kernel suite for this Studio entry change.

```sh
bash "$OUT/desktop.sh" baseline baseline
bash "$OUT/desktop.sh" depth-final
bash "$OUT/validate.sh"
git diff --check
```

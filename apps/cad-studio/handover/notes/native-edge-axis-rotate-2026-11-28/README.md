# D2235 — Start Rotate about one native straight edge

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `8935b4981`.

Right-click one original native straight edge of a standalone solid and choose **Rotate about edge**. The current mesh and source must own the selected edge. Its exact endpoint coordinates select the X, Y or Z world axis. The existing Rotate controls take that axis and one endpoint as editable initial values. The saved Rotate node stores the numeric pivot and axis.

- **PASS, actual desktop.** The original context menu lacked this action. The new action starts the Z axis with pivot (4.125, −3.75, 6.375) mm. The visible gizmo origin agrees within 1 CSS px. Preview at 30° and Cancel preserve the source document. Apply keeps both endpoints, including (4.125, −3.75, 18.375) mm, fixed. All eight strict native vertices and the centroid (16.445508, 14.910254, 12.375) mm match an independent rigid rotation. The volume stays at 9,600 mm³. Undo, Redo, Save, Close, reload and Open preserve the expected document and native shape.
- **PASS, affected checks.** 17 Studio tests, scoped lint, Studio types, production Studio build and whitespace. The tests cover three exact cardinal axes, an outdated display mesh, mixed selection, a display-only edge, an almost-cardinal edge and duplicate native ownership.
- **FAIL, first type check.** The draft treated a selected sketch region as an array. The corrected check tests for the region record.
- **NOT_RUN.** Arbitrary axis, associative edge-to-axis updates, other desktop shapes, mobile and full local suites. #629 retains broader direct manipulation work. The first mechanical CAD baseline remains 8/10.

```sh
pnpm --dir apps/cad-studio test edge-rotation vertex-pick-filter assembly-rotate-selection
bash "$OUT/desktop.sh" before --baseline
bash "$OUT/desktop.sh" final-preview
git diff --check
```

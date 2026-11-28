# D2175 — Set the floor thickness of an original top-open L Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `ea976315437f342ef17ffe5862d340b5961ce776`.

Picking the original top cap of a zero-draft upright orthogonal L extrusion offers Separate floor in Shell. Wall controls the uniform side offset, including the exact round inside corner. Floor thickness controls only the cavity's starting height. The kernel retains the original named exterior supports, exact side offsets, one floor and one connected rim. It verifies the strict native topology and targeted physical constraints before returning the result. An equal floor and wall produce byte-identical native geometry to uniform Shell.

The optional literal `floorThickness` belongs to the existing Shell feature. The saved value is editable in History and a revision-pinned local Agent command can supply it using the single exact original top face. A floor that fills the cavity is refused before Apply and the Shell panel names the input to reduce.

## Verification

- **PASS, actual desktop Studio.** The original 40 × 30 × 20 mm L had uniform wall and floor at 2 mm with no separate-floor control. With the new option, Preview and Cancel retained the original. With Wall 2 mm, Floor 3 mm produced 7,065.407075 mm³. Floor 20 mm was refused and Apply was disabled. History changed Floor to 5 mm and volume to 8,267.123890 mm³. Undo/Redo and project Save, Close, reload and Open restored their exact documents and dimensions. The independent formula uses outer area 864 mm² and cavity area `600 + 4 − π` mm². Native evaluation finds the original base at Z0, rim at Z20 and cavity floor at Z3 or Z5. Both actual browser runs recorded 1,289 unchanged sources, zero page errors, console errors and downloads.
- **PASS, Kernel and Model.** 35 emitted Kernel tests, 19 Model tests and 16 Studio focused tests. Exact supports, native incidence, pcurves, volume, area, centroid, material rays, watertight tessellation, clockwise and counterclockwise authoring, source tags, nonzero base and native file readback pass. The local Agent command matches the Studio operation and refuses a missing revision, a wrong opening and nonnumeric input. Kernel, Model and Studio type checks, affected lint, script syntax and production Vite build passed.
- **FAIL, first desktop pass.** The native collapse refusal appeared in the Kernel detail disclosure. The final product shows specific floor guidance in the main Shell message and the browser verifies it.
- **NOT_RUN.** Other opening sides, arbitrary per-face thickness on a freeform shell, combining an independent floor with an explicit corner mode, full local suites and mobile. #13 remains open. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/part-l-shell-floor.test.mjs packages/barocss-cad/test/part-closed-l-shell-join.test.mjs packages/barocss-cad/test/part-shell-walls.test.mjs packages/barocss-cad/test/part-corner-shell-walls.test.mjs
pnpm --dir packages/barocss-cad-model test shell-corner shell-walls chord-shell revision-pinned-edit
pnpm --dir apps/cad-studio test failed-feature opening-shell-failure command-preview
TOP_L_SHELL_FLOOR_FROZEN=1 node apps/cad-studio/test/top-l-shell-floor-browser.mjs "$OUT/baseline" --baseline
TOP_L_SHELL_FLOOR_FROZEN=1 node apps/cad-studio/test/top-l-shell-floor-browser.mjs "$OUT/final"
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

# D1880 — Extract the live Studio Sketch inspector

P4 [row 15](../../roadmap-rows/15.md) and [row 20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `de1f228ca82f158c4d2b0144f0c0cc9d29638056`.

`StudioSketchInspector` composes the existing panel, snap controls, saved Bézier picker and outline tools. The edit handlers use the same document, rendered draft, captured generation and live shape checks. The App still owns the sketch state and passes the current controls and commands to the inspector. `App.tsx` falls from 2,757 to 2,734 lines and from 229,185 to 225,411 bytes.

- **PASS, actual desktop Studio.** Temporary blank input on an existing circle, rectangle and slot leaves the native model and draft history intact. A valid edit remains effective. The saved quadratic and cubic picker preserves the pending field, confirms parked draft Undo/Redo, keeps accepted bytes on Cancel and changes only the selected cubic poles on Finish. Actual Save and fresh Open retain the edited sketch and independent DXF readback. The previous DXF stays untouched. Outline rotation confirms the first-point and custom-pivot cases, restores the saved points on native Open and refuses the constrained variant. The three flows capture 5, 14 and 6 states with zero page, console or source-change errors.
- **PASS, affected checks.** 22 Studio tests, scoped lint, Studio type check and production build. The first attempt passed. The Browser proofs include the extracted source in their frozen inputs.
- **NOT_RUN.** Whole local suites, other renderers, mobile and the other open desktop checklist items. The first mechanical CAD baseline remains 8/10.

## Reproduce the affected checks

Use Node 22.19.0, the existing local Chrome and Playwright and the installed independent DXF reader for the Bézier workflow. Run one heavy job at a time. Freeze the worktree during Studio.

```sh
pnpm --dir apps/cad-studio test saved-bezier-picker-ui saved-bezier-selection outline-rotation-commit sketch-coordinate-feedback sketch-outline-tools sketch-bezier-studio ellipse-axes-recovery
pnpm --dir apps/cad-studio build
SKETCH_NUMBER_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-number-blank-browser.mjs "$OUT/number"
BEZIER_RESELECT_FROZEN=1 node apps/cad-studio/test/bezier-reselect-browser.mjs "$OUT/bezier"
OUTLINE_ROTATION_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-outline-rotation-browser.mjs "$OUT/rotation"
```

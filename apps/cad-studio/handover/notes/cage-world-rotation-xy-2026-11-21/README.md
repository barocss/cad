# D1495 — Qualify the X and Y SubD cage rotation handles

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `0939f9b8d63422f3142a466dab19ee9f57c9b58f`.

Extend the existing desktop qualification to world X in Right orthographic view and world Y in Front orthographic view. Both use the original selection centre. Match the signed pointer sweep to the orientation of the model axes in the selected view, then compare the edited cage with an independent world rotation and numeric Rotate. Product code stays unchanged.

## Verification

- **PASS, actual desktop Studio.** Two adjacent top faces of a 96-quad cage use their original centre `[20, 32.5, 26]` mm. The X and Y handles each apply −15°, +15° and Shift +8° with the correct sign from their different viewing directions. Selected points agree with independent world-axis coordinates within 1e-10 mm. The +15° results match numerical Rotate exactly. Unselected points, face connectivity, creases and selection stay fixed.
- **PASS, ownership and file.** Identity click, Escape, lost pointer capture, cage and document Undo/Redo, exact Done and direct drag Save and fresh Open pass for both axes.
- **PASS, controls.** Actual Top-view Z control, 25 focused Studio tests, browser syntax and diff checks.
- **FAIL, first X test harness.** It read a previous SVG mark during the right-view transition and timed out waiting for hover. The final harness waits for the model view and the SVG points to settle. Both X and Y then pass on the original product implementation.
- **NOT_RUN.** New local production build, oblique rotation accuracy, explicit pivot on X/Y, local-axis rotation, mirror-specific desktop cases, other renderers, mobile and full suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during desktop runs and keep the evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-state-presentation
node --check apps/cad-studio/test/cage-selection-transform-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_TRANSFORM_SOURCE_FROZEN=1
node test/cage-selection-transform-browser.mjs "$EVIDENCE/right" --rotate-x
node test/cage-selection-transform-browser.mjs "$EVIDENCE/front" --rotate-y
node test/cage-selection-transform-browser.mjs "$EVIDENCE/top" --rotate-drag
```

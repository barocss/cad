# D1494 — Rotate the selected SubD cage region about a guarded vertex

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `45ef53b9105159568d2e09bb922fce861cc4e7b8`.

The existing cage-vertex input and ownership check now serve both Uniform scale and Rotate. Switching tools within the session retains the chosen pivot. A changed point or indexed cage removes the handle until a current point is confirmed.

## Verification

- **FAIL, original capability.** Actual Studio offered a centre rotation handle and a separate numeric vertex pivot. The physical Rotate tool had no vertex-pivot option.
- **PASS, actual desktop Studio.** Set vertex 90 at `[12.5, 30, 26]` mm as the pivot for two connected cage faces. The marked origin stays within 0.5 px of that projected vertex. At −15°, +15° and Shift +8° around world Z, independent coordinates agree within 1e-10 mm. The pivot and unselected points stay fixed, and the 15° drag matches numerical Rotate exactly.
- **PASS, ownership.** A negative vertex ID refuses without a handle. Rotate → Uniform scale → Rotate keeps the same current vertex. Moving the chosen vertex +1 mm along Z removes the rotation handle and reports the retired choice. One cage Undo restores its exact location and the handle. Escape and lost pointer capture discard held drag previews.
- **PASS, history and native file.** An identity click adds no step. Cage and document Undo/Redo, exact Done and direct drag Save and fresh Open retain the accepted configuration.
- **PASS, affected checks.** 25 Studio and 19 Model tests, scoped lint, Studio types and production build, browser syntax and diff checks. Actual centre rotation and vertex-scale controls pass.
- **NOT_RUN.** Physical X/Y or local-axis rotation, mirror-specific desktop cases, other renderers, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during actual Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-rotation cage-local-direction
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-selection-transform-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_TRANSFORM_SOURCE_FROZEN=1
node test/cage-selection-transform-browser.mjs "$EVIDENCE/original" --expect-no-rotate-vertex
node test/cage-selection-transform-browser.mjs "$EVIDENCE/vertex" --rotate-vertex
node test/cage-selection-transform-browser.mjs "$EVIDENCE/centre" --rotate-drag
node test/cage-selection-transform-browser.mjs "$EVIDENCE/scale" --vertex-scale
```

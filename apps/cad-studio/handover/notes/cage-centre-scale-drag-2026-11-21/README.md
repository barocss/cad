# D1491 — Scale a selected SubD cage region with the viewport

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `2d355f7a08073c7dba7ab97956e7587bd8f87e77`.

Add Uniform scale to the cage drag tool picker. Reuse the existing viewport uniform scale gizmo and the same Model transform as numerical Scale. The pivot is the original selected-vertex centre. Every preview starts from the original cage, and only the current captured pointer can accept it. Done requires the exact current cage build.

## Verification

- **FAIL, original capability.** Actual Studio had a numerical Scale selection control for two selected faces, but no cage scale drag.
- **PASS, actual desktop Studio.** On two connected faces of a 96-quad box, use the centre cube to set 0.8, 1.1 and Shift 1.12. Each result agrees with the independently computed pivot and selected vertex coordinates within 1e-10 mm, with unselected positions, faces, creases and selection preserved. The 1.1 result is exactly equal to the numeric Scale result. An identity click adds no cage step.
- **PASS, ownership and native file.** Escape and loss of pointer capture cancel the preview. The accepted document stays equal during a drag. Each accepted factor adds one cage step. Cage Undo and Redo, exact Done, document Undo and Redo, and native Save and fresh Open preserve the accepted drag result.
- **PASS, affected checks.** 25 Studio and 15 Model checks, scoped lint, Studio typecheck and production build, browser syntax and diff checks. Actual numerical transform, local normal drag and connected proportional drag controls pass.
- **NOT_RUN.** Drag about an explicit cage vertex, rotation drag, mirror-specific desktop cases, large-cage timing, alternate renderers, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during each actual Studio run. Keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-presentation gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-proportional-drag cage-local-direction
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx,viewport/gizmo.ts,viewport/viewportPointerInput.ts}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-selection-transform-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_TRANSFORM_SOURCE_FROZEN=1
node test/cage-selection-transform-browser.mjs "$EVIDENCE/original" --expect-no-scale-drag
node test/cage-selection-transform-browser.mjs "$EVIDENCE/qualified" --scale-drag
node test/cage-selection-transform-browser.mjs "$EVIDENCE/numeric"
CAGE_LOCAL_MOVE_SOURCE_FROZEN=1 node test/cage-local-move-browser.mjs "$EVIDENCE/local" --drag
CAGE_PROPORTIONAL_SOURCE_FROZEN=1 node test/cage-proportional-drag-browser.mjs "$EVIDENCE/proportional"
```

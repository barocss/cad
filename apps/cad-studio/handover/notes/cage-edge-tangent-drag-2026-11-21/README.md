# D1488 — Drag one SubD cage edge along its tangent

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `93505f5b039219647fd442c874580932cae19e4b`.

Expose Edge tangent in the existing cage drag frame. Reuse the numerical direction from the lower to the higher vertex ID and the existing signed viewport handle. Selecting a local frame with multiple edges disables the handle and reports the required selection. A different pick mode uses its compatible frame or World axes. No model recipe, topology operation, or tolerance changes.

## Verification

- **FAIL, original capability.** Actual Studio picked the oblique edge while World arrows were available, but Edge mode had no physical tangent control. The numerical edge move still worked.
- **PASS, actual desktop Studio.** On the 96-quad box, rotate one quad 15° about X and select the edge between vertices 96 and 97. The T handle moves only those endpoints. Positive means `[0, cos(15°), sin(15°)]`. The +2 mm, −1 mm and Shift +1.5 mm moves match this independent direction within 1e-10 mm. Faces, creases and selection stay fixed. Multi-edge selection refuses the tangent frame without any fallback handle.
- **PASS, ownership and native file.** Escape and loss of capture discard the preview and preserve the exact accepted cage. Each released nonzero move adds one cage step. Cage and document Undo and Redo, exact Done and Save and fresh Open all preserve the expected cage.
- **PASS, affected checks.** 25 Studio and 23 Model checks, scoped lint, Studio types, production build, browser syntax, diff checks and the actual face-normal drag control pass.
- **NOT_RUN.** Local face U/V dragging, local rotation dragging, alternate desktop GPU backends, mirror-specific browser cases, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during actual Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs gizmo cage-transform-draft gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-local-direction cage-local-rotation cage-selection-move cage-proportional-drag
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-local-move-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_LOCAL_MOVE_SOURCE_FROZEN=1
# Use --expect-no-edge-drag on the original runtime.
node test/cage-local-move-browser.mjs "$EVIDENCE/original" --expect-no-edge-drag
node test/cage-local-move-browser.mjs "$EVIDENCE/edge" --edge-drag
node test/cage-local-move-browser.mjs "$EVIDENCE/normal" --drag
```

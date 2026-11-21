# D1489 — Drag a SubD cage quad along its in-plane U and V directions

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `92036948d008fb9500347d827a52b7e90498d828`.

Face U and Face V reuse the numerical local directions and the same one-axis physical handle as Face normal. U follows the lowest vertex ID toward the winding successor on the selected plane. V is the winding normal crossed with U. The viewport shows only the chosen direction, with the signed distance in millimetres. The exact cage rebuild and the commit boundary stay in the existing editor.

## Verification

- **FAIL, original capability.** Studio with the tilted quad offered World axes and Face normal for dragging. Neither in-plane option was available. The document stayed unchanged.
- **PASS, actual desktop Studio.** Start with a 96-quad cage and tilt one quad 15° about X. For this exact face, the independent U direction is `[1, 0, 0]` and V is `[0, cos(15°), sin(15°)]`. Each frame verified +2 mm, −1 mm and Shift +1.5 mm on vertices 93, 96, 97 and 94 within 1e-10 mm. Unselected positions, faces, creases and selection stayed fixed. Attempting the same frame with multiple faces refused without fallback.
- **PASS, ownership and native file.** Each frame passed Escape and loss of pointer capture, one cage step per released move, Cage Undo/Redo, exact Done, document Undo/Redo and native Save → fresh Open. The accepted model stayed equal while dragging.
- **PASS, controls.** 25 Studio and 23 Model checks, scoped lint, Studio typecheck and production build, browser syntax and diff checks. Both prior physical frames, Face normal and Edge tangent, pass again in actual desktop Studio.
- **NOT_RUN.** Arbitrary, nonplanar or multi-face directions, simultaneous in-plane two-axis drag, local rotation drag, mirror-specific acceptance, other desktop GPU backends, mobile and full local suites. #625 stays open.

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
node test/cage-local-move-browser.mjs "$EVIDENCE/original" --expect-no-plane-drag
node test/cage-local-move-browser.mjs "$EVIDENCE/u" --u-drag
node test/cage-local-move-browser.mjs "$EVIDENCE/v" --v-drag
node test/cage-local-move-browser.mjs "$EVIDENCE/normal" --drag
node test/cage-local-move-browser.mjs "$EVIDENCE/edge" --edge-drag
```

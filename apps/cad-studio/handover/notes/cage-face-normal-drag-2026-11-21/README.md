# D1487 — Drag one SubD cage face along its normal

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `8d112e09648c9c208d361c31b6bf5ae1870a4ff9`.

The cage editor offers a Face normal drag frame for one planar convex quad. Its positive direction follows the original face winding and uses the existing numerical move validator. The viewport shows one signed translation handle and uses the existing grid step. Shift uses the fine step for this handle. The default World axes and its existing Shift-extrude path stay available. The current cage and exact build still govern Done.

## Verification

- **FAIL, original capability.** Actual desktop Studio with the selected tilted quad shows World axes. The normal is available through numeric Move selection. The physical normal handle and Drag frame control are absent.
- **PASS, actual desktop Studio.** On a 30 × 20 × 16 mm box with 96 quads, select and rotate one quad 15° about X. Drag it +2 mm, −1 mm, and +1.5 mm with Shift. Exactly vertices 93, 96, 97 and 94 follow `[0, −sin(15°), cos(15°)]` within 1e-10 mm. Every other coordinate, all faces, and the creases and selection stay fixed. The top end-on view hides the normal handle. Multiple selected faces refuse without a world-axis fallback.
- **PASS, ownership, history and file.** Escape and explicit release of the captured pointer restore the original tilted cage without adding a History step. During the preview the accepted document stays unchanged. Each released nonzero move adds one cage step. Cage Undo and Redo, exact Done, document Undo and Redo, and native Save and fresh Open preserve the expected cage.
- **PASS, affected checks.** 25 Studio and 23 Model tests, scoped lint, Studio typecheck and production build. Actual numeric local move and existing body-gizmo controls pass. Browser syntax and diff checks pass. The first body-gizmo command stopped at its environment check before it started Chrome. Re-running with the existing CAD_ROOT setting passed.
- **NOT_RUN.** Local edge and U/V drag, local rotation and scale drag, mirror-specific browser cases, alternate desktop GPU backends, mobile and full local suites. The coordinate checks measure the cage. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during each browser run and retain evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs gizmo gizmo-presentation gizmo-state-presentation cage-transform-draft
node packages/barocss-cad-model/scripts/test.mjs cage-local-direction cage-local-rotation cage-selection-move cage-proportional-drag
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx,viewport/GizmoMarks.tsx,viewport/Viewport.tsx,viewport/gizmo.ts,viewport/viewportPointerInput.ts}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-local-move-browser.mjs
git diff --check
export CAD_ROOT="$PWD"
cd apps/cad-studio
export CAGE_LOCAL_MOVE_SOURCE_FROZEN=1
# Use --expect-no-drag on the original runtime.
node test/cage-local-move-browser.mjs "$EVIDENCE/original" --expect-no-drag
node test/cage-local-move-browser.mjs "$EVIDENCE/qualified" --drag
node test/cage-local-move-browser.mjs "$EVIDENCE/numeric-control"
GIZMO_SOURCE_FROZEN=1 node test/gizmo-state-actual-browser.mjs "$EVIDENCE/body-gizmo-control"
```

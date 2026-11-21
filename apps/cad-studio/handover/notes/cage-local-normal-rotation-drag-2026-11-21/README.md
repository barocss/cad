# D1496 — Drag a SubD cage quad around its winding normal

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `d070b373425f9914e297ac36e93a89364887cd71`.

Add Face normal to the Rotate drag frame for one planar convex cage quad. The current numerical normal supplies the rotation axis and the original selection centre supplies the pivot. Draw and pick the same projected arc. Hide the arc if its projected plane is narrower than 12 CSS px. Compute the signed angle from successive pointer-ray intersections with the original turn plane and snap its total. Reject near-parallel or backward intersections and movement through the projected centre. Wheel zoom or a changed viewport frame cancels the gesture. World rotation uses its existing input path.

## Verification

- **FAIL, original capability.** Actual Studio could rotate the quad around its numeric normal. The physical Rotate tool had only World axes.
- **PASS, actual desktop geometry.** Tilt a single quad −15° about X and use its original centre `[23.75, 32.5, 26]` mm. In oblique Iso perspective, an independent world-plane +30° sweep measures −15.0557306646° in CSS screen angles. Actual Studio applies +30° and −30° with the correct sign. Coordinates match the independently conjugated planar rotation within 1e-10 mm. The +30° result is exactly equal to numerical Rotate. Unselected positions, face connectivity, creases and selection stay fixed.
- **PASS, projection and history.** The actual Right orthographic edge-on view hides the arc. Escape, wheel zoom and desktop resize discard the held turn. Releasing after resize leaves the old cage and History unchanged and allows the next valid drag. Cage Undo, exact Done, document Undo/Redo and direct drag Save and fresh Open preserve the accepted cage.
- **PASS, affected checks.** 26 Studio and 19 Model tests, scoped lint, Studio types, production build, browser syntax and diff checks. A pure oblique ray fixture verifies signed ±42°, zero projected ring width and inadmissible rays. Actual numerical local rotation and guarded World vertex rotation controls pass.
- **NOT_RUN.** Physical normal rotation about an explicit vertex, face U/V or edge tangent rotation, multi-face and mirror-specific desktop cases, other renderers, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during actual Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-presentation gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-rotation cage-local-direction
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx,viewport/gizmo.ts,viewport/GizmoMarks.tsx,viewport/Viewport.tsx,viewport/localTurnDrag.ts,viewport/viewportPointerInput.ts}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-local-rotation-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_LOCAL_ROTATION_SOURCE_FROZEN=1
node test/cage-local-rotation-browser.mjs "$EVIDENCE/original" --expect-no-normal-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/normal" --normal-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/numeric"
CAGE_TRANSFORM_SOURCE_FROZEN=1 node test/cage-selection-transform-browser.mjs "$EVIDENCE/world" --rotate-vertex
```

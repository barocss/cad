# D1497 — Drag a SubD cage quad around its U and V axes

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `3d4eac4e1cc983b4ee6ec1e112626cf816ea4426`.

Extend the Rotate drag frame to Face U and Face V. Each uses the existing numerical axis and the original selection centre. Orient the arc from the next axis of the right-handed U, V, normal frame. Both use the same pointer-plane angle and visibility, ownership and cancellation checks as Face normal.

## Verification

- **FAIL, original capability.** Actual Studio offered a Face normal drag and numerical U/V rotation, while the physical U and V choices were absent.
- **PASS, actual desktop geometry.** Use a quad tilted −15° about X in oblique Iso perspective, with centre `[23.75, 32.5, 26]` mm. In the selected fixture, U is `[1, 0, 0]` and V is `[0, cos(15°), −sin(15°)]`. Each physical frame applies both −30° and +30°. The independent coordinate rotation agrees within 1e-10 mm, and +30° matches numerical Rotate exactly. The +30° pointer sweep measures −11.2202806944° on the U screen projection and 33.3022554269° on the V projection. Unselected positions, faces, creases and selection stay fixed.
- **PASS, refusal and native file.** Two selected faces refuse without a fallback arc. The Front orthographic edge-on view hides U and the Right view hides V. Escape, zoom and desktop resize cancel held drags. Cage and document Undo/Redo, exact Done and direct drag Save and fresh Open pass for both axes.
- **PASS, affected checks.** 26 Studio and 19 Model tests, scoped lint, Studio types, production build, browser syntax and diff checks. The actual Face normal regression passes.
- **NOT_RUN.** Edge tangent rotation, an explicit vertex pivot for local quad rotation, mirror-specific desktop cases, other renderers, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during actual Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-local-direction cage-local-rotation cage-selection-transform
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-local-rotation-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_LOCAL_ROTATION_SOURCE_FROZEN=1
node test/cage-local-rotation-browser.mjs "$EVIDENCE/original" --expect-no-plane-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/u" --u-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/v" --v-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/normal" --normal-turn
```

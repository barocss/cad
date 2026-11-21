# D1498 — Rotate one SubD cage edge around its tangent

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `a2d8dbe37efe05ac2260a75affcf48b26e304d00`.

Add Edge tangent to the physical Rotate frame for one current nonzero cage edge. Its positive direction follows the lower to the higher vertex ID, as in numeric Rotate. The original rotation plane and captured view govern the angle. The default pivot sits on the edge and gives an identity. The guarded Cage vertex picker moves the selected endpoints in a signed arc about a parallel axis through an off-edge point.

## Verification

- **FAIL, original capability.** Actual Studio offered numerical tangent rotation and other drag frames. The physical Edge tangent rotation choice was absent.
- **PASS, actual desktop geometry.** Pick the oblique edge 96 → 97 on the −15° tilted quad. With its midpoint, a physical +30° turn creates no cage change or history entry. With vertex 90 at `[12.5, 30, 26]` mm, physical −30° and +30° follow the independent tangent `[0, cos(15°), −sin(15°)]` within 1e-10 mm. The +30° drag matches numeric Rotate exactly. Unselected vertices, faces, creases and selection stay fixed.
- **PASS, refusal and native file.** Two edges and an invalid pivot refuse without a fallback arc. Right orthographic hides the edge-on arc. Escape, zoom and desktop resize cancel the held drag. Cage and document Undo/Redo, exact Done and direct drag Save and fresh Open preserve the accepted cage.
- **PASS, affected checks.** 26 Studio and 19 Model tests, scoped lint, Studio types, production build, browser syntax and diff checks. Actual Face V rotation passes again.
- **NOT_RUN.** Other edge configurations, face-local rotation about an explicit pivot, mirror-specific desktop cases, independent smooth-surface quality, alternate renderers, mobile and full local suites. #625 stays open.

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
node test/cage-local-rotation-browser.mjs "$EVIDENCE/original" --expect-no-edge-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/edge" --edge-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/face-control" --v-turn
```

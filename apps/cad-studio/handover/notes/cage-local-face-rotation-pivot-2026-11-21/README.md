# D1499 — Share the guarded vertex pivot with all three SubD face rotation axes

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `ea7db045b489f8692c009a5191b60e803889e5ed`.

Expose the existing pivot on Face normal, Face U and Face V. Keep the original baseline axis and signed pointer-plane angle. Use the same exact current-vertex check as World rotation, Edge tangent rotation and Uniform scale.

## Verification

- **FAIL, original capability.** Actual Studio had the physical normal/U/V frames and the numerical vertex pivot. The physical face frames offered the selection centre alone.
- **PASS, actual desktop geometry.** Each frame rotates one −15° tilted quad about vertex 93 at `[20, 30.085185434277328, 26.647047612756303]` mm. The ±15° drags match independent coordinates within 1e-10 mm. +15° matches the corresponding numeric Rotate exactly. The pivot, unselected points, connectivity, creases and selection stay fixed.
- **PASS, ownership and refusal.** An invalid vertex ID and multiple faces refuse without fallback. Moving the chosen vertex +0.5 mm along Z retires the pivot for each frame. Cage Undo restores the exact point and arc. Edge-on views, Escape, wheel zoom and desktop resize preserve the prior cage.
- **PASS, history and file.** Cage and document Undo/Redo, exact Done and direct drag Save and fresh Open preserve the result for all three axes.
- **PASS, affected checks.** 26 Studio and 19 Model tests, scoped lint, Studio types and production build, browser syntax and diff checks. The actual Edge tangent pivot control passes again.
- **NOT_RUN.** Mirror-specific transform drags, other cage families, alternate renderers, mobile and full local suites. #625 stays open.

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
node test/cage-local-rotation-browser.mjs "$EVIDENCE/original" --expect-no-face-pivot
node test/cage-local-rotation-browser.mjs "$EVIDENCE/normal" --face-pivot
node test/cage-local-rotation-browser.mjs "$EVIDENCE/u" --face-pivot --u-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/v" --face-pivot --v-turn
node test/cage-local-rotation-browser.mjs "$EVIDENCE/edge-control" --edge-turn
```

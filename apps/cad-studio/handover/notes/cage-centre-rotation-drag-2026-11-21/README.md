# D1493 — Rotate the selected SubD cage region in the viewport

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `d8f729b3e8bf64b22a31c64fa76d9592aca83df6`.

Add the Rotate cage drag tool. It uses the existing world-axis viewport arcs and numerical rotation transform. Capture the selected-vertex centre and the source cage at pointer-down. Each preview uses that same cage and pivot. The owned pointer can accept one released angle. Exact Done still requires the current cage build.

## Verification

- **FAIL, original capability.** Actual Studio offered numeric Rotate selection for two selected faces. The cage drag picker had no Rotate and no rotation arc.
- **PASS, actual desktop Studio.** Rotate two connected top faces of the 96-quad box about world Z in Top orthographic view. The independent centre is `[20, 32.5, 26]` mm. At −15°, +15° and Shift +8°, the coordinates agree with independent rotation within 1e-10 mm. Unselected positions, face connectivity, creases and selection stay fixed. The +15° drag is exactly equal to numerical Rotate. An identity click adds no step.
- **PASS, ownership and file.** Escape and loss of capture discard the held rotation. The accepted document stays unchanged during the preview. Cage Undo/Redo, exact Done, document Undo/Redo, and direct drag Save and fresh Open retain the accepted cage.
- **PASS, affected checks.** 25 Studio and 19 Model tests, scoped lint, Studio typecheck and production build, browser syntax and diff checks. Actual vertex-scale and face-normal controls pass.
- **NOT_RUN.** Physical X/Y acceptance, oblique or edge-on rotation accuracy, explicit vertex-pivot rotation, local-axis rotation, mirror-specific desktop cases, other renderers, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during each desktop run and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-presentation gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-rotation cage-local-direction
pnpm exec eslint apps/cad-studio/src/{subd/useCageGizmo.ts,ui/CagePanel.tsx,viewport/gizmo.ts,viewport/viewportPointerInput.ts}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-selection-transform-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_TRANSFORM_SOURCE_FROZEN=1
node test/cage-selection-transform-browser.mjs "$EVIDENCE/original" --expect-no-rotate-drag
node test/cage-selection-transform-browser.mjs "$EVIDENCE/rotation" --rotate-drag
node test/cage-selection-transform-browser.mjs "$EVIDENCE/scale" --vertex-scale
CAGE_LOCAL_MOVE_SOURCE_FROZEN=1 node test/cage-local-move-browser.mjs "$EVIDENCE/normal" --drag
```

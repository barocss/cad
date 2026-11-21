# D1492 — Scale a selected SubD cage region about a current vertex

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base: `eb4ad190b17a6dadd9aee85c9ae6c9be9b50eb83`.

Add a Cage vertex pivot to uniform-scale drag. The viewport and numeric transform use the same pivot parser. The handle remains at the chosen position throughout its gesture. An explicitly entered vertex owns its opening coordinates and indexed connectivity. If those no longer identify that point, remove the handle until the person enters a current vertex.

## Verification

- **FAIL, original capability and first candidate.** Original Studio offered only the selection-centre scale handle. In the first vertex-pivot candidate, deleting top faces 80 and 81 renumbered the original vertex 90 at `[12.5, 30, 26]` to 89. The old number 90 remained in range but was now at `[12.5, 35, 26]`. Actual Studio accepted a 1.1 scale about that wrong point. The first diagnostic chose two faces that did not renumber the vertices. The corrected fixture above reproduces the defect.
- **PASS, actual desktop guard and recovery.** With the same deletion, Studio keeps the visible old ID, hides the scale handle, and asks for a current vertex. The cage and document stay equal. Entering 89 puts the handle on the original point and allows the expected 1.1 scale. Cage Undo restores the exact post-delete draft.
- **PASS, actual normal workflow.** A 96-quad box uses vertex 90 at `[12.5, 30, 26]` as the pivot for two connected faces. The handle is within 0.5 px of the projected vertex. Scale factors 0.8, 1.1, and Shift 1.12 match independent coordinates within 1e-10 mm. The pivot and all unselected vertices stay fixed, and the 1.1 drag agrees exactly with numerical Scale. Escape, loss of capture, cage Undo/Redo, exact Done, document Undo/Redo and direct drag Save and fresh Open pass.
- **PASS, affected checks.** 25 Studio and 19 Model checks, scoped lint, Studio types and production build, browser syntax and diff checks. Actual selection-centre drag and numerical transform controls pass.
- **NOT_RUN.** Other renumbering operations and mirror-specific desktop cases, rotation drag, large-cage timing, alternative renderers, mobile and full local suites. #625 stays open.

Use Node 22.19.0, installed Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during desktop runs and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-direction cage-local-rotation
pnpm exec eslint apps/cad-studio/src/{subd/cageTransformDraft.ts,subd/useCageGizmo.ts,ui/CagePanel.tsx}
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-selection-transform-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_TRANSFORM_SOURCE_FROZEN=1
node test/cage-selection-transform-browser.mjs "$EVIDENCE/original" --expect-no-vertex-pivot
# Run the alias probe against the first candidate without the vertex-ownership guard.
node test/cage-selection-transform-browser.mjs "$EVIDENCE/unsafe" --expect-stale-pivot
node test/cage-selection-transform-browser.mjs "$EVIDENCE/topology" --pivot-topology
node test/cage-selection-transform-browser.mjs "$EVIDENCE/vertex" --vertex-scale
node test/cage-selection-transform-browser.mjs "$EVIDENCE/centre" --scale-drag
node test/cage-selection-transform-browser.mjs "$EVIDENCE/numeric"
```

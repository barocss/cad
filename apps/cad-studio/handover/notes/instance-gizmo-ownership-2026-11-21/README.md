# Assembly instance gizmo drag ownership

P3, row 10. Tested parent `a8a27caf6abeb8d3d7984e41eb77ebf73a92e345`. Studio's App dropped from 3,988 to 3,966 lines. The assembly hook owns the move and turn gizmo, snapping, the live preview, cancellation and the wait for evaluated meshes. App supplies the active document and tool context and retains the existing accepted-placement/history operation.

## Reproduction

The desktop fixture has two top-level cubes at X = 0 and 50 mm. Dragging the first cube 23 mm along X changed the renderer pick at (33, 10, 20) to the first cube while the document still stored X = 0.

- Escape ended the pointer gesture. The first cube still appeared at the preview position after releasing the mouse. Display modes stayed disabled.
- Releasing actual pointer capture before pointer-up produced the same result.
- Keyboard activation of the second cube during the first cube's drag switched the Browser selection. On pointer-up the first cube moved to X = 23 mm in the document.
- Undo while a real native placement reply was held restored X = 0 in the document. The first implementation still showed the cube at X = 23. The same stale picks remained after the reply was delivered.

## Change

The gesture belongs to one selected occurrence, document, worker generation and evaluated mesh. The captured viewport handler checks its owner before updating the preview or committing. Pointer cancellation removes the live preview. An accepted drag retains its preview only for the accepted occurrence while its previous mesh is displayed. Undo or a document replacement invalidates that preview. When constraints leave the mesh unchanged, the existing timeout clears only its own pending preview.

## Verification

- PASS: 23 focused Studio tests covering placement math, mate restrictions, snapping and gizmo interaction. Scoped lint, Studio type check and the production build passed.
- PASS: Desktop Chrome/WebGPU, physical mouse on the X arrow. A click without movement left the document and history unchanged. On Escape, lost capture and switching to the other cube, the renderer picked the first cube at (10, 10, 20), nothing at (33, 10, 20), and the second cube at (60, 10, 20). The display control became available. Neither the cancellation nor the subsequent mouse release altered the document or Undo/Redo state.
- PASS: A normal release moved the first cube exactly +23 mm along X. Undo, Redo, native Save and fresh Open reproduced both placements. A separate physical Z rotation produced +45 degrees about the cube's center, with the expected translation about that pivot. Undo/Redo and native reopen preserved the rotated placement.
- PASS: The test scheduler withheld the original native placement reply across Undo and then delivered it. Both before and after delivery the accepted document, renderer picks and display-mode availability matched the restored placement.
- All six final browser runs had zero page errors, console errors and watched changes. The lost-capture test released the actual captured pointer via the DOM API. The pending-reply test controlled delivery timing only. The interactive fixture used unmated top-level cubes. Desktop dragging with assembly mates and mobile were not run.

```sh
node apps/cad-studio/scripts/test.mjs instance-drag instance-placement instance-field gizmo
pnpm build
cd apps/cad-studio
for mode in escape lost-capture switch commit undo-pending; do
  INSTANCE_GIZMO_SOURCE_FROZEN=1 node test/instance-gizmo-cancel-browser.mjs "$OUTPUT/$mode" "$mode"
done
```

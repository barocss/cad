# Move a straight driving length label in the active sketch

P1, roadmap row 09, [issue #741](https://github.com/barocss/cad/issues/741). In Select or Dimension, drag the number perpendicular to the edge. The arrows, dimension line and extension lines follow it. The adjacent reset button restores the automatic 26 CSS px offset. Escape or a cancelled pointer restores the position from before the drag.

The viewport stores the signed offset in sketch units for the current editing session. It uses the edge identifier when one is available and reprojects the position when the camera changes. The placement carries no document or draft history entry. A click still focuses the corresponding edge length field. Double-click opens the numeric editor. Closing the sketch discards its placement. App.tsx and the document schema have no changes in this delivery.

## Desktop Studio measurements

Before implementation, a 48 CSS px drag moved the label 0 px. [Baseline and screenshots](https://github.com/barocss/cad/issues/741#issuecomment-7041611447).

The browser reopened a 40 × 20 mm XY profile from its 5 mm Extrude history entry. With a second 30 mm sketch in the same file, both sketches used the same local length key and side tag. Measurements used the projected sketch endpoints and SVG screen transforms.

| Operation | Observed result |
| --- | --- |
| Drag 48 px perpendicular and 24 px along the edge | The label centre moved from (620.001, 664.892) to (620.001, 712.892) CSS px. Both measured endpoints stayed fixed. The offset changed from 26 to 74 px. |
| Escape and pointer cancellation | The committed 74 px offset returned after each preview. The cancellation test dispatched a DOM pointercancel with the actual captured mouse pointer ID. |
| Pan, zoom and reset | Panning retained 74 px. Zoom changed the rendered offset to 56.068 px. Both views measured 5.32787 mm from the edge. Reset restored 26 px at the new zoom. |
| Finish after layout changes only | The accepted document retained its object identity, history and geometry. The independent native result was one valid closed solid of 4,000 mm³, within 0.0000001 mm³. |
| Edit the actual driving length | A double-click and numerical edit changed 40 to 44 mm. Draft and document Undo/Redo restored their respective geometry. The native volume after the edit and after Save and fresh Open was 4,400 mm³. |
| Session ownership | The other 30 mm sketch, another edit of the original sketch and editing the freshly opened file all started at 26 px. |

The tested length is a straight driving edge. Other dimension kinds retain their existing controls. The tested camera operations were desktop pan and zoom in the active XY sketch. The browser read the local app and used no live model provider.

## Reproduce

Use the installed Node 22.19.0, desktop Chrome and Playwright. Use the heavy gate for each command and place browser output outside the checkout.

```sh
pnpm --filter @barocss/cad-studio-app test inline-dimension-layout sketch-constraint-mark-layout fixed-triangle-inline-ownership
pnpm --filter @barocss/cad-studio-app build
pnpm --filter @barocss/library-docs build
cd apps/cad-studio
STRAIGHT_LENGTH_LABEL_SOURCE_FROZEN=1 node test/straight-length-label-drag-browser.mjs "$LABEL_OUT"
D1358_SOURCE_FROZEN=1 node test/inline-dimension-width-browser.mjs "$INLINE_OUT"
```

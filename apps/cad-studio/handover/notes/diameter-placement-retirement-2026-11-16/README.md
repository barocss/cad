# Retire stale Diameter placement and tool warnings (#47)

A Diameter placement carrying source settings/projection identity is now retired before paint if those sources change or become busy. Its pending position and hover are cleared immediately, and the user is asked to select the rim again. The existing click-time guard remains as defense in depth. Escape from a tool without an active placement now also clears that tool's prior warning when returning to Select.

## Validation

- Actual Chrome WebGPU, 1024×800 and 1440×900: PASS. Turn Hidden lines off, choose Plate 2 from coincident rims, show diameter preview, Undo the settings change, and move the pointer without clicking: preview is gone and reselect guidance is visible. Clicking the old placement point creates no dimension or history entry; Redo still restores the settings. Reselect Plate 2 and place exactly one dimension retaining the p2 reference, then Undo removes only the dimension.
- Invalid straight-edge Diameter selection shows the expected circle/arc warning; Escape returns to Select and removes that warning without changing the document.
- Existing keyboard chooser focus, either occurrence selection, chooser Escape, hidden-line invalidation, and undrawn lower-rim exclusion regressions pass in the same runs.
- Final source-frozen receipts PASS; no browser/console errors. Narrow-screen retired-preview screenshot inspected.
- Studio TypeScript/Vite production build and modified browser-driver lint PASS. The five previously documented unrelated DrawingWorkspace unused-variable lint failures were not changed; no whole-file lint pass claimed.
- Evidence: `/tmp/cad-diameter-stale-r2-1024-20261116` and `/tmp/cad-diameter-stale-r2-1440-20261116`; build `/tmp/cad-diameter-stale-build.log`.

Geometry, diameter resolution, saved schema and protected #126 WIP unchanged. Screen readers, deliberate delayed-worker injection and broad cross-sheet placement were not run.

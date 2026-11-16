# Render light Range cutoff help (#66)

Removed the incorrect always-visible `Range 0: no fall-off with distance` and repeated positive range line. Point/Spot Range retains its value with explicit mm and aria-valuetext. Hover and keyboard-focus help distinguishes zero cutoff from ongoing attenuation and explains the positive cutoff. The help is stable across range edits, so a focused tooltip cannot retain a now-wrong zero/positive-specific explanation.

## Grounding

`packages/barocss-gpu/src/viewer/shaders/surface.ts` point and spot loops divide illumination by squared distance; positive position.w adds a smooth cutoff. `packages/barocss-gpu/src/viewer/shaders/path-trace.ts` does the same for positive direction.w. Neither shader was changed. No lighting values, range bounds, step or mutation implementation changed.

## Verification

- Focused Range/Shadow helper tests: 3/3 PASS. Changed-file lint and Studio typecheck/build PASS.
- Actual Chrome WebGPU at 1024×900 and 1440×900: Point and Spot 0 mm hover + keyboard focus descriptions, keyboard edits to 85 mm, no duplicate positive-range text, Undo to 80 / Redo to 85, actual Save and fresh Open retaining both lights, then return to zero with correct help. Screenshot reviewed.
- Initial browser check caught missing focus-help opt-in; added it. Subsequent test separates hover from existing keyboard focus. Final stable copy and both-width flow rerun successfully.

## Limits

No photometric pixel comparison or path-tracing execution in this task; unchanged raster/path-tracing attenuation was checked in source. Default Bracket settings flow only, no other materials or assistive-device claim. #126 WIP untouched.

# Varying Fillet interior locations (#118 follow-up)

## Frozen scope
Read-only Interior / Interior 1 / Interior 2 locations on the existing exact single straight original edge. Fractions use the current Start→End direction, not raw saved `at` coordinates or the rounded output mesh. Geometry/interpolation algorithms, schema, authoring values, WIP and HOLD scopes are unchanged.

| Check | Expected | Status |
| --- | --- | --- |
| Modes | One 25→50%, two 25/75%, Ends removes markers | PASS |
| Invalid | Empty or reversed fractions hide interior markers rather than showing old values | PASS |
| History draft | 40/60% updates locations before Apply without modifying document; Reset restores 25/75% | PASS |
| History/persistence | Apply/Undo/Redo/native JSON Open preserve fraction and edge identity | PASS |
| Current geometry | Length 30→40 moves 40/60% markers x12/18→16/24 without replacing saved points | PASS |
| Ownership | Closing editor/document replacement clears owned markers; old draft cleanup cannot clear a newer owner | PASS |

Independent location oracle: affine interpolation on the already-verified source edge [0,0,20]→[L,0,20] gives x=L×fraction, y=0, z=20. Existing endpoint and native varying-radius geometry proofs remain relevant; this change does not alter radius interpolation.

## Results

Actual Chrome/WebGPU `cad-fillet-station-locations-02` PASS. One/two/Ends modes, reversed and empty positions, History 40/60% live draft and Reset, Apply/Undo/Redo/native JSON Open, close and document replacement passed. Width 30→40 updates station coordinates from x12/18 to x16/24 while the authored radii records stay unchanged. History draft screenshot visually reviewed. No downloads.

A real Worker preview reply was deliberately held while inputs changed 50→40→blank→50. Station markers moved x15→12→hidden→15 before any preview result was released, and the accepted document remained unchanged. This is forced ownership/input instrumentation, not a performance measurement.

The initial source review identified that the App's ordinary active key excludes typed HUD values. A narrow subscription for stationMode/stationAt/station2At now updates these markers immediately; radius-only changes do not add App rerenders. Separate History payload identity controls cleanup, and draft origin prevents a previous local draft being attached to a new source. Unedited fractions are not rounded through a percent display. Independent review found no remaining source blocker.

#118 stays OPEN for curved/multi-edge endpoint locations. This increment adds interior locations only to the established exact single-straight-edge scope, and makes no new kernel or geometric-family claim.

Final checks: focused 4/4, default Studio tsc, modified helper/notice/NodeEditor/Viewport/test lint and production build (4.43 s) PASS. Existing full-App unused `_k` lint debt is unchanged. Protected worktree still has the same eight WIP entries.

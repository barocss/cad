# Shortest cage path — issue #626 follow-up

Source parent `44c648578659783470d89138d29278611df5ab2d`. Independent drawing-evaluation change `534ac8b33118938e9d443da2e82b4eab3b657f20` was fast-forwarded before commit; it does not touch this selection, panel or driver. Existing unrelated WIP preserved; no doc-sync work resumed.

## Contract

Pick exactly two vertices (Shift-click the second), then Shortest path. The result contains only the path's edges and switches to Edge mode, ready for Crease or movement. This is minimum **edge count**, not minimum physical length. Starting at the lower seed vertex ID, breadth-first search visits neighbours in ascending ID order. Equal-length ties therefore select the lexicographically first vertex-ID path and are independent of pick order, face order, coordinates and crease flags. Paths use actual cage edges, not face diagonals or spatial proximity.

Selection changes preserve cage, start, Undo and Redo references. A subsequent geometry operation owns its own step and Undo restores the path. Wrong seed count/mode, invalid current indices, malformed face cycles and disconnected components refuse through the existing guard without modifying selection. IDs are current cage-local indices, not persistent provenance IDs; topology edits use their existing selection ownership/reset policies. There is no crease stopping or length-weighted mode.

## Verification

- PASS: 18 focused Model tests including five path tests and existing connected selection / mode / boundary Loop/Ring regression checks. Fixed answers cover quad grid ties, reversed seeds, coordinate and face-order changes, closed cube, pole, polygon boundary, actual hole boundary, spatially overlapping disconnected shells, isolated/stale/duplicate/three seeds, malformed indices, subsequent Crease/move history, redo preservation, and path on newly split topology.
- PASS: changed-source lint, Model and Studio TypeScript, Studio production build. Independent read-only review found no blocker; its optional split-topology/three-seed cases were added.
- PASS: actual Chrome/WebGPU 1440×1000 on a 30×20×16 four-quads-per-side box. Two vertex picks selected four edges. An independent fixture oracle enumerates the six monotone four-edge grid routes from known coordinates and compares the exact minimum-ID path. Reversed pick order matches. Selection leaves cage/document/history unchanged. Cancel, four-edge Crease, cage Undo/Redo, Done, document Undo/Redo and actual native Save/fresh Open passed.
- First browser launch stalled at `browserContext.newPage` before Studio interaction. Only that verification browser was terminated. A fresh retry passed with identical product/driver sources; no application fix or weakened assertion was used.
- Final run: zero page/console errors and watched source changes; contexts/browser/server closed. Actual screenshot viewed. Native semantic equality and SHA256 are recorded alongside.

## Limits

Actual Studio coverage is one regular box; disconnected/pole/hole and topology-edit cases are pure tests, not broad browser qualification. No geodesic distance, crease barrier, arbitrary B-rep selection, final smooth-surface dimension or manufacturing claim. Existing HOLDs remain. Issue #626 stays open for remaining optional boundary policy and broader actual cage coverage.

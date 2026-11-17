# #625 numeric local-axis rotation

2026-11-17. Rotate selection now offers world axes (unchanged default) and the same baseline local axes as Move: single edge tangent, planar convex quad normal/U/V. Existing current vertex-ID or selection-centre pivot remains. Signed degrees follow the right-hand rule. Original direction and pivot are held fixed throughout preview, never derived from the prior candidate. Multi-edge/face and unsupported geometry refuse for local frames; world rotation still supports ordinary grouped picks. Uniform scale has no direction dependence, so no artificial frame selector is added. No local gizmo/rotation drag or B-rep change.

## Numerical contract and first finding

Local rotation uses normalized direction and delta-form Rodrigues, q=p+sinθ(n×p)+(1−cosθ)n×(n×p), with degrees reduced modulo360 before trigonometry. Mirror seam constraints, selected-only coordinates, topology/creases, no-op/history and exact-receipt Apply remain.

Initial generic normal-rotation browser PASS did not cover a discovered no-op defect: an oblique edge rotated about its own tangent/centre could drift ~8.9e−16 mm and add an undo step. This was reproduced independently before publication. Delta form avoids reconstructing the unchanged parallel component. A point whose scaled cross-product components are individually within cancellation roundoff, |a−b|≤4ε(|a|+|b|), retains original coordinates bit-for-bit. This is a floating-point cancellation boundary, not an absolute mm snapping tolerance or an exact symbolic collinearity guarantee. Genuine transverse displacement outside this boundary remains active; extreme/overflow input still refuses.

The first browser run is preserved as pre-fix evidence only. Final evidence reruns include actual oblique-edge tangent37° no-op Apply and tilted face normal rotation. No system/user process was killed: a requested stop of an already-finished owned type process returned 'no such process'; the original run completed normally before source edits.

## Remaining scope

Local-axis U/V and off-line tangent rotation are covered numerically, not each by separate accepted browser/native files. Local rotation dragging, broad mirror/nonregular cage fixtures, injected stale exact responses and pointercancel/lost capture remain unqualified here. No change to HOLD/GPU/schema/dependencies. This is cage editing, not a whole smooth-surface rigid transform or manufacturing tolerance guarantee.

## Final verification

**58/58 Model**, **22/22 Studio** focused tests PASS after the no-op fix. Independent tilted90° fixture/off-origin pivot, Cartesian equivalent axes, reversal/whole turns, selected edge/face/vertices, mirror/history/overflow are covered. Additional oblique and decimal edge-centre 37/90/180/270/−90 operations retain identity and redo. Actual nonzero transverse displacement as small as1e−20 for a cardinal axis, oblique1e−12 and nearparallel1e150 coordinates remains active. Changed-source/test lint, final Model/Studio type checks and production build PASS. Independent implementation/UI and fix review: no blocker.

Final actual Chrome/WebGPU1440×1000 run **PASS**: single face tilted15° about X; oblique edge tangent37° is exact cage/history no-op through Apply; local face normal−10/5/15°, selection-centre and explicit vertex pivot against independent Rx·Rz·Rx⁻¹ coordinate oracle;360° no-op Apply; invalid pivot/Escape; final10° Apply, cage/document Undo/Redo, Done, native Save/fresh Open semantic equality. Multi-face normal movement refusal and edge tangent movement/Escape regression included. Source watcher stable, no page/console errors, all owned contexts/browser/server closed. Published screenshots are final post-fix run; preview and saved smooth result are distinguished.

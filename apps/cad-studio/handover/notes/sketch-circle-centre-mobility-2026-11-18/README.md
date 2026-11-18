# Existing #21: attached circle-centre mobility

Read-only local first-order diagnosis for one circle attached to a closed straight material polygon (3–16 points). The existing residual-checked solver already includes the centre. This change maps that helper to a separate circle-centre row, never to an authored point, and reuses existing hover/focus inspection. Solver, kernel, storage and authored geometry are unchanged.

## Qualified scope
Existing straight constraints plus valid point-to-circle cdx/cdy/cdist. Current circle radius is held fixed: radius freedom and finite motion are not diagnosed. Multiple circles, mixed arcs/circles, tangent/edge/circle-circle constraints, spline/ellipse/construction ownership, malformed data and uncertain/residual-invalid cases remain unavailable. Existing circle-free result shape is preserved.

## Evidence
- Original actual baseline PASS: native valid plate/hole, real UI X/Y dimensions, draft Undo/Redo, removal, Finish/document Undo/Redo, physical Save/freshOpen; disclosure unavailable.
- Fixed actual PASS: two centre directions; X constraint leaves Y; X+Y leaves none; removing X leaves X. Hover and keyboard focus mark circle:0 and cleanup clears inspection without changing the accepted document. All draft/document Undo/Redo and Save/Open checks pass.
- Independent strict native BRep: one body, volume (1200−9π)*5 and analytic centroid for 40×30×5 plate with radius3 hole at (12,10). Authored coordinates, radius, fixed-point rules and Extrude unchanged. Original and fixed final .bcad files are byte-identical.
- Existing one-arc actual regression PASS, including radius lock/unlock, Undo/Redo, native geometry and Save/Open.
- Focused circle6 + straight4 + arc6 =16/16 PASS; scoped lint PASS. Model tsc, Studio tsc and Vite build PASS (existing bundler warnings only).
- Focused numerical tests separately cover cdist tangent direction, coincident-centre degeneracy, residual mismatch, invalid input and no-circle shape preservation; these are not extra browser cases.
- Independent read-only review found no remaining blocker. Browser contexts/server closed; disk available26.02→24.75GiB during final sequence, above2GiB reserve.

No failed final browser attempt. Existing #21 remains OPEN; no schema/HOLD expansion or viewport/picking change. Exact CI and public-image render results follow on the existing issue.

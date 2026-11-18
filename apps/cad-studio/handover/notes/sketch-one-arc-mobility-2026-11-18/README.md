# Existing #21: one closed line-and-arc outline mobility

A read-only extension of existing first-order numerical diagnosis. The same authored solver system supplies endpoint directions and arc-center participation. A center-moving arc appears in the edge list even when both endpoints are fixed; helper centers are never exposed as authored points. Existing endpoint API/null semantics and solving, geometry, stored files and undo behavior remain unchanged.

## Qualified boundary
One closed material polygon with 3–16 points and exactly one finite circular arc, or the existing straight scope. Radius and line-arc tangency constraints use the existing residual-checked Jacobian. Reject ignored/malformed arc H/V, length, radius, segment-rule or tangent indices. Composite circles, multiple arcs, spline/ellipse ownership remain unavailable. No finite-motion/rigidity certification: an exact radius-locked semicircle can still have first-order center participation; near-singular uncertain diagnosis remains unavailable rather than locked.

## Validation
- Product-original actual baseline02 PASS: fixed endpoints, arc bulge0.5/radius12.5, mobility absent; radius lock/unlock, draft Undo/Redo, Finish/document Undo/Redo, physical Save/freshOpen all preserved. Strict native solid valid, authored points/rules unchanged.
- Fixed02 actual PASS: free-center edge1 only, no movable endpoint rows; radius lock removes mobility, unlock and Undo/Redo restore edge1; reopened locked state. Original and fixed final saved .bcad bytes are exactly identical.
- Existing straight point-directions actual regression PASS, including oblique direction and file lifecycle.
- Model focused83/83, Studio label2/2, final arc6/6, scoped lint PASS. Model tsc and Studio tsc+Vite build PASS. Independent read-only review no remaining blocker.
- 16 diagnostic probes: free center, fixed radius, tangency, exact semicircle singularity and near-singular uncertainty. Tangency/singularity were focused numerical tests, not additional actual browser cases.

## Failed harness attempts preserved
Original baseline01 reached Finish then failed exact native vertex comparison: unchanged volume/centroid with y roundoff up to1.78e-15mm. Comparator now uses one-to-one vertex/centroid distance1e-9mm (stricter than existing1e-7mm native linear policy), volume1e-9mm³, strict validity/count plus exact authored document checks. Saved results were NOT_RUN in that first attempt.
Fixed01 clicked the disclosure then counted rows before React onToggle rendered them. Failure DOM already contained the correct Edge1. Fixed only locator wait ordering before count assertions; product unchanged. Existing browser/type/build stages were NOT_RUN in that attempt.

The broader #21 remains OPEN. No new issue, solver/kernel changes, schema change or HOLD relaxation. Exact CI and public image render confirmation are recorded on #21 after push.

# #625 single quad plane U/V numeric movement

2026-11-17. Bounded follow-up to local normal/tangent numeric movement. Not complete local rotate/scale or gizmo support.

## Contract

Move frame adds Single quad U and Single quad V. Exactly one planar strictly convex quad is required, with existing length/planarity/convexity validation unchanged. Canonical corner is the lowest actual vertex ID; U points toward its winding successor, projected into the accepted face plane and normalized. V=N×U, using winding normal N. On exact planar faces cyclic face-array indexing leaves U/V unchanged; reversing winding intentionally changes the successor and frame. Within existing planarity tolerance numerical frame differences can occur. This is an orthonormal geometric plane basis, not texture UV coordinates or a smooth-surface parameterization.

Signed millimetre movement uses the immutable original direction. Only selected face vertices change. Unit direction and orientation policy are displayed. Pivot is irrelevant and hidden. Proportional mode remains world-only and cannot combine with plane-frame movement. Mirror constraints, original history, exact Apply and Cancel/Escape gates unchanged.

## Verification

Model focused49/49 and Studio21/21 PASS. Independent asymmetric 3-4-5 tilted trapezoid verifies U=(1,0,0), V=(0,.6,.8), N=(0,-.8,.6), unit length/orthogonality/right-handedness, all cyclic starts and reversed orders, vertex-ID reassignment, U/V displacement/unpicked preservation/history and unsupported inputs. Independent read-only model/UI review: no blocker.

Actual desktop, build/type and saved-file results are retained below and in the associated issue. Local rotation/scale, drag gizmos, arbitrary/nonplanar/multi-face frames and broad injected-race/pointer-cancel browser qualification remain open. No B-rep/GPU/HOLD/schema/dependency change.

Model/Studio type checks, changed-source/test lint and production build **PASS**. Actual1440×1000 Chrome/WebGPU **first run PASS**: off-origin box single face rotated15° about world X, canonical U independently rotated from the original edge, V independently computed from N×U; U/V−1/.5/2 compared at every coordinate, unpicked coordinates and topology preserved. Repeated values/frame changes retain one candidate step. Multi-face normal refusal and single-edge tangent/Escape regression included. Empty distance refusal, exact Apply, cage/document Undo/Redo, Done and native Save/fresh Open semantic equality passed. Watched source stable, no console/page errors, all owned contexts/browser/server closed.

Actual screenshots inspected: plane-v-preview is pending exact evaluation; fresh-open is accepted and saved smooth geometry. Movement in the cage plane does not imply preserving the whole smooth shape or a manufacturing dimension. Browser U Apply/persistence separately, proportional browser regression, pathological mirror, late-response injection and pointer cancellation NOT_RUN; pure regressions included.

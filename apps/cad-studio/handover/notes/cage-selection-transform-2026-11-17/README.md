# Numeric cage selection rotation and scale — issue #625 A slice

Tested source parent `6af9873add61d0e2042a18beae73987465c94098`. Independent assembly-pattern change `a0b1e7b87f8e09fdcd77a9390fb9566c9e380f8e` was fast-forwarded before commit; no overlap in the cage transform/preview paths. Existing unrelated WIP and doc-sync pause preserved.

## Contract

Rotate selection offers right-handed world X/Y/Z rotation in degrees; Scale selection offers a positive uniform dimensionless ratio. Both transform only the unique vertices referenced by the current vertex/edge/face selection. The pivot is the baseline selection centre or an explicitly entered current cage vertex ID; its coordinates are shown. This is a partial cage edit, not a whole-body transform or a final-surface dimension constraint.

Every input update recomputes from the same immutable baseline. Apply retains at most one candidate cage step after the current session/document exact evaluation succeeds. Cancel, including Escape from an input, restores baseline selection and Undo/Redo. Invalid values/pivots/overflow show the baseline and disable Apply. Rotation by whole turns, scale 1 and transformations fully consumed by constraints add no history. Original mirror-seam vertices remain on their plane, following the existing constraint policy; this can make a partial rotation non-rigid. Native evaluation remains authoritative for the resulting shape.

While either loop or transform preview is active, other cage operations, picking, mode changes, gizmo and history are blocked. Done cannot commit an unresolved preview. Source replacement and full cage cancellation clear both draft types. The existing lane cleanup and session/document receipt identity are retained, not replaced with undo-depth-only acceptance. No kernel/gizmo/GPU engine, schema or dependency change.

## Verification

- PASS: Model 23 focused tests including five independent transform tests and selection/path/mode/boundary regressions. Fixed off-origin asymmetric-coordinate answers cover all world axes and negative angles, factor .5, vertex/edge/two-face regions, shared vertices once, unselected-coordinate preservation, X/Y/Z seam constraints, no-op/Undo/Redo and atomic invalid/overflow refusal.
- PASS: Studio 15 focused tests covering transform parser/pivot/nonaccumulation, existing loop draft, completion readiness and source begin policy.
- PASS: changed-source/test lint, Model and Studio TypeScript, Studio production build. Independent read-only hook/UI review found no blocker. Existing bundler warnings remain.
- PASS: first actual Chrome/WebGPU transform run, 1440×1000. On an off-origin 30×20×16 box, two connected top faces were rotated in Z (5/10/15-degree previews) with independent coordinate calculations; explicit vertex pivot, invalid pivot, input Escape and no-op Apply were checked. Uniform .8/.9 scale previews, empty/zero/negative refusal, Cancel restoration, one step per Apply, cage Undo/Redo, Done, document Undo/Redo, native Save and fresh Open passed. Unselected coordinates and face connectivity stayed unchanged.
- PASS: existing actual loop-ratio browser driver rerun against the same final product source, including preview replacement, invalid inputs, Cancel, Undo/Redo and native reopen.
- Both browser runs had zero page/console errors and watched source changes; all contexts/browser/server closed. Native semantic equality and SHA256 are in `receipt-summary.json`.
- Both screenshots were viewed: `selection-scale-preview.png` deliberately shows a draft while exact checking is pending; `fresh-open.png` shows the accepted saved native result reopened. Neither is a concept image or a geometry oracle by itself.

## Open scope

Issue #625 remains OPEN. This slice is numeric input only: rotate/scale dragging, local tangent/normal/UV frames and numeric translation are not added. Actual-browser coverage is two faces, Z rotation and centre/vertex pivots on one regular box. Other axes, vertex/edge selections and mirror constraints have pure tests, not broad actual-cage qualification. Pointer cancellation for new rotate/scale handles is NOT_RUN because those handles do not exist. Injected reverse-order/error/source-replacement browser races remain future coverage; existing pure receipt identity checks passed. Final smooth dimensions, shape preservation, arbitrary B-rep editing and manufacturing are not claimed. Existing HOLDs remain.

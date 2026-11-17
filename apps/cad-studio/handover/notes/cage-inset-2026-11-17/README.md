# Single planar convex quad Inset — issue #628

Tested source parent `e945a93aa4cb17a3e911242365a756cf5510627d`. Independent assembly restoration change `8e71db226d9167818b630e43f1c1aabe842bcd6e` fast-forwarded before commit; no cage-path overlap. Existing WIP and doc-sync pause preserved.

## Bounded geometry contract

Exactly one selected planar, strictly convex quad accepts a positive inward cage distance in mm. Offset intersections are calculated in an orthonormal plane frame. The inner quad replaces the selected face at its current index, and four surrounding quads are appended. Original vertex coordinates, unrelated face connectivity and outer creases are preserved; new inner/radial edges are smooth. The inner face remains selected for the existing Extrude command.

Planarity/length tolerance is `max(1e-9 mm, face extent * 1e-9)`; adjacent offset normals with determinant <=1e-12 refuse. Distances at or below the length tolerance refuse rather than silently adding tiny topology. Concave/nonplanar/degenerate/duplicate-vertex faces, non-finite or nonpositive distance, inner collapse/crossing and coordinate overflow refuse without changing the source. There is no polygon repair, arbitrary projection or region merging. Faces touching the existing exact mirror seam are explicitly unsupported; other source mirror semantics remain unchanged.

Each preview recomputes from one baseline; valid changes never accumulate topology. Apply retains one candidate history step only after current exact evaluation succeeds. Invalid input restores the baseline and blocks Apply. Cancel/Escape restores baseline selection/history. Inset, loop and transform previews are mutually exclusive, block other cage edits and Done, and share the existing session/document identity, source-replacement and stale-result gates. No schema, dependency or B-rep kernel change.

## Verification

- PASS: Model 29 focused tests, including six independent inset tests. 10×8 quad inward 1 produces fixed 8×6 inner coordinates. Outer coordinate/crease preservation, signed winding, eight opposite-direction internal twins, four boundary edges, tilted 3-4-5 plane, reversed winding, unaffected neighbouring face, malformed/collapse refusal, mirror-seam refusal and inset→Extrude→move→Undo/Redo are covered.
- PASS: Studio 17 focused tests: inset baseline/nonaccumulation/refusal plus transform/loop/readiness/begin-policy regression.
- PASS: changed-source/test lint, Model/Studio types, production build, independent hook/UI review. Existing bundler warnings remain.
- PASS: first actual Chrome/WebGPU 1440×1000 inset run. A 7.5×5 top cage quad used .5/1/1.5 mm previews with independent inner-coordinate answers, unchanged original positions and constant topology count. Empty/zero/negative/collapse inputs, input Escape, Cancel, Apply and cage Undo/Redo passed. The selected inner face fed the existing Extrude, followed by an actual 2 mm world-Z gizmo drag; top cage vertices reached z=18 within 1e-6 mm. The sequence used one Inset step, one Extrude step and one move step. Done, document Undo/Redo, native Save/fresh Open passed.
- PASS: existing numeric selection-transform browser regression rerun on final source, including native reopen.
- Both runs: zero page/console errors or watched source changes; contexts/browser/server closed. Native semantic equality and hashes are in `receipt-summary.json`. Both published screenshots were viewed.

`inset-ready.png` is a checked draft before Apply. `fresh-open.png` is the accepted native file after Inset+Extrude+move. The cage top z=18 is deliberately NOT called a final smooth height: the reopened UI reports smooth bounds around 17.84 mm. Screenshots/hashes are not substitutes for numerical/topological checks.

## Still open

Multi-face regions, holes/concavity, nonplanar inset and seam-crossing inset are not supported. Actual Studio qualification is one regular box; tilted/reversed/crease/mirror refusal cases are pure tests. Broader source replacement/error/response-order injection and actual-cage coverage remain future work. No final smooth wall-thickness/area, exact B-rep inset, manufacturing or general topology-validity claim. Existing HOLDs remain; #628 stays open.

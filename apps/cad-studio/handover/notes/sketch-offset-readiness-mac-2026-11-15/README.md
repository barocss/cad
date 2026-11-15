# D1348 — Sketch Offset contour readiness (#135)

## Bounded change

Panel visibility and Offset execution share the existing target resolver: active admissible closed shape, otherwise latest completed nonconstruction closed outline. Empty/open-only drafts no longer display ordinary In/Out. A closed outline remains usable beside an active open stroke. Empty eligible face sketches retain distance and Link face outline + inset; ordinary In/Out appears only after a target exists. On-demand help names the actual Outline N. A stale Nothing to offset notice clears when a target becomes available. Distance magnitude/range and native failure handling are deferred to #136.

## Verification

- Four focused resolver/readiness tests, final Studio tsc and production build PASS; helper/Panel/actions/test lint and diff check PASS. Initial test fixture incorrectly used tool line instead of the actual polygon identifier; corrected after browser freeze without modifying product source.
- Source-frozen actual Chrome/WebGPU1024/1440: blank/open-line actions hidden; closed rectangle plus active open stroke still offsets. Separate 20×12 rectangle supports2mm Out/In and draft Undo/Redo; finished3mm extrusion strict native B-rep valid, independent ring volume(240−128)×3=336mm³. Document Undo/Redo and actual Save/fresh Open PASS.
- Real planar cap selection→empty face Sketch retains distance/Link while ordinary In is absent. Link action creates the linked outline/inset. Actual narrow open-line/closed-plus-open/linked geometry screenshots reviewed; field and link availability also DOM-asserted.
- Browser first run PASS. Receipt SHA256 `5100c5ca262c46ef79bb3ef37e785a6ddda28f218329920246b542e28f09534b`.

No assistive-technology qualification or arbitrary-profile claim. Existing HOLD unchanged; next #136 positive distance validation and local collapse recovery.

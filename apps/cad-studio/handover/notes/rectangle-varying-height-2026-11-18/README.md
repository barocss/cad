# Existing #20: numeric Height with a varying top-edge Fillet

This bounded work unit belongs to existing issue #20; the umbrella remains open.

## Scope and preservation
A plain numeric rectangle extrusion with a terminal single horizontal top edge Circular Fillet, two numeric atEnd radii, numeric Height-only change. The complete native cuboid topology, semantic corner roles, exact old signature, actual old/new top edge and unchanged unambiguous endpoint pairing are proved before refreshing only the selected signature. Historical radii.at anchors and radii array remain unchanged. Admission follows the existing stored signature rounding; native geometry proof stays exact.

No generic rematching, vertical/bottom varying edge extension, interior stations, parameter-bound varying radii/Height, downstream consumers, Conic/G2 or HOLD scope. Existing constant/bound constant finishes and Width/Depth behavior remain. App/SelectedInstancesPanel were not changed.

## Evidence
- Original actual Chrome baseline PASS: UI front-top Fillet Start1/End3, Height10→30 REFERENCE_MOVED atomic safe refusal. Document/history/native geometry unchanged; Cancel, physical Save/fresh Open and radius fields preserved. This was an editability gap, not data loss.
- Fixed actual Chrome PASS: Height30→14→40; document/signature-only update; strict native solid, independent endpoint tangent contacts and native/worker volume agreement; Undo/Redo; impossible Height1 atomic refusal; recovery Cancel and Save/fresh Open. Unequal varying analytic volume is not claimed.
- Existing constant Height actual browser regression PASS.
- Focused 91/91 PASS, including four top edges/reversed anchors, fractional Height, topology/pairing/signature refusal and shared async owner/revision guards. Scoped ESLint PASS.
- Model tsc PASS; Studio tsc and Vite build PASS.
- Actual delayed-worker race, new bound varying support and vertical/station support NOT_RUN/not claimed.
- Fixture review corrected an initial mistaken expectation that stored anchors should move. The corrected fixture was frozen before baseline and fixed runs. No browser failure resulted from that draft fixture.
- Initial lint prefer-const finding corrected before final tests; independent read-only review found no remaining blocker.

Screenshots: baseline-refused.png, height30.png, reopened.png. Receipts retain frozen-source checks and cleanup. Exact CI is recorded on #20 after push.

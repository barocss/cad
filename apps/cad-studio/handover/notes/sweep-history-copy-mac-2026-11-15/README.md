# D1314 — Clarify Sweep History editing and expose long path names

Addresses barocss/cad#56 without changing saved paths, geometry or feature dimensions.

## Acceptance scope

A standalone Faceted straight Sweep from a circular profile, copied path with the original issue's long name. At1024x800 History shows the full wrapped path, Copied and both endpoints. A focusable name and pointer title expose the whole name; Enter/Delete on this text do not accidentally apply/delete the feature. Empty-field Sweep editors with Edit sketch now say where profile dimensions are edited rather than saying no dimensions are editable. Other feature messages unchanged.

## Verification

Actual Chrome WebGPU PASS: create Ø6 Sweep; inspect profile/name/endpoints; focus long name, Enter/Delete and unchanged-document checks; Edit sketch→Diameter8→Finish; strict native bounds8x8x22 and one valid body; copied path unchanged; Undo/Redo; change/rename original source while History retains saved copy; native Save/fresh Open. Screenshot inspected: full wrapped path, Copied/endpoints and Ø8 profile remain visible. Final receipt SHA256 `48da7e96c689c60a00923c03959bc22ce9d550fe84fc7170b4b3e47d4c497c35`, frozen sources unchanged.

Initial driver failed waiting for exact accessible label Diameter because the existing label includes mm; corrected to the observed #sk-diameter input, then the entire flow passed. No product bug was hidden by this correction. Independent readonly review found no blocker. Final Model/Studio type-check, focused lint and production build PASS.

NOT_RUN: actual screen reader, curved or linked route-specific fixtures, mobile and whole suites. Do not claim those accepted. Existing generated-doc consistency FAIL and all prior HOLDs remain.

## Next

D1315 / issue#544: prevent a blank Direct Sew tolerance from silently using its old value; retain explicit0 automatic behavior. Keep geometry/tolerance semantics unchanged.

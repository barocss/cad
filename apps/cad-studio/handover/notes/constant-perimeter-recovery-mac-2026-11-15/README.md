# D1391 — bounded Constant perimeter failure recovery

#503 recovery branch completed at the tested desktop scope. No native fit change is adopted. The reported R8/H10/Constant0.6 entire-top-perimeter case has a real generated seam/carrier mismatch. Reversing edge order can hide the tessellation error while strict native validation still fails.

Read-only in-memory current-source probes checked the existing edgeFitTolerance path at 1e-7, 1e-8 and 1e-9 across all six edge orders. None qualified all required strict geometry checks. At 1e-7 none were strict-valid; direct analytic carrier residuals ranged about 7.10e-5 to 6.50e-4 mm despite mass agreement. At 1e-8 some orders tessellated and matched volume but remained strict-invalid, others refused or failed. At 1e-9 all six refused the existing fit guard. No source files changed for those probes. No tolerance relaxation, new fitter or projection repair is authorized by this result.

Independent equal-radius mitre slice integration for R8/H10/r0.6 gives volume 500.5265811815141 mm³. Mass agreement alone does not validate the seam.

## Scoped recovery implementation

`src/state/closedPerimeterFilletFailure.ts` reports only the owned current Constant Circular mixed-perimeter failure. It requires one appended unique Fillet, unchanged source-node prefix, matching current source body/ref/key and selected native names, one closed cycle with one native circle plus two native straight edges, and the exact native edge-off-surface error. A present feature ID must match. Actual tessellation failures can omit it; the exact current feature carrier namespace (`<id>_body0/s0/f` followed only by digits) is required in every case. It never fabricates feature metadata. Original code/detail stay unchanged.

`src/state/useCommandPreview.ts` calls this only inside existing live command/context/value, whole-candidate and result-revision guards. Existing preview clearing, disabled Apply and document retention remain unchanged. Copy states only that this perimeter could not be built and suggests Edges/curved-rim reselection. It does not call all Constant perimeters unsupported or promise success. No native implementation changed.

## Verification

Node22.19.0: 16/16 focused tests PASS, including actual native failure, positive/negative carrier and feature ownership, old revision, replaced values, retired preview, and adjacent #502/failed-feature regressions. Targeted ESLint, Studio TypeScript and production build PASS. Independent read-only High review approved the guarded diagnostic and preserved native details.

Actual Chrome first run PASS at 1024×800 and 1440×900. Initial Constant0.6 and Varying1.2→Constant0.6 both show the scoped failure with disabled Apply, unchanged document and original native digest. Edges/open curved rim with Constant0.6 previews and applies with the exact constant recipe (no varying radii). Strict B-rep, finite nonempty 4,774-triangle tessellation, Undo/Redo and native Save/fresh Open PASS. Native volume501.7002527573654 mm³ versus independent swept-section oracle501.7002527575834 mm³ (absolute difference2.18e-10 mm³). Six refusal/recovery screenshots reviewed: title, recovery, radius, Apply and collapsed Kernel detail are readable at both widths. No source changes/runtime errors; clean shutdown.

Receipt `d1391-first/receipt.json`: SHA256 `d480afcaf0017f668b2a0d31347ab318ef695f08dfc18b875eb3ac1015ab234c`. Evidence retained locally outside the repository.

This satisfies #503's alternative of truthful failure-location recovery and preserved failed preview. It does NOT repair or qualify entire-perimeter geometry. The fitted seam defect and reversed-order strict-invalid result remain unresolved numerical work; no fitter widening, tolerance relaxation or mass-only acceptance follows. Browser qualification is only R8/H10/r0.6; other dimensions/mixed carriers and assistive technology NOT_RUN. Existing unrelated App lint and aggregate docs drift remain separate; no full-suite claim.

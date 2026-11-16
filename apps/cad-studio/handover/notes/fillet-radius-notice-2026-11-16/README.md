# Fillet radius presentation (#58)

Constant Fillet no longer repeats its single radius in the native scope summary. The Radius input retains its value and mm unit; native picked/tangent-added counts remain. Normal valid Radius does not repeat the positive-only rule. Invalid nonempty Radius uses one linked inline range notice and custom validity; only the exact owned simple Radius error duplicate is hidden. Other geometry errors, empty input, and other-field errors are not hidden. Distinct varying start/end scope values remain.

## Verification

- Focused notice/radius unit tests: 2/2 PASS, including negative command/value/error-detail controls. Changed-file lint and Studio typecheck/build PASS. Initial test command fixture typing was corrected before final checks.
- Chrome WebGPU 1024×800 and 1440×900: Slot/stadium extrusion H6, single top straight edge, Constant R1.5. Scope retains one picked and three tangent-added native edges; Radius and positive-rule duplication absent. R0 and R-1 have one linked inline message, invalid browser/ARIA state, disabled Apply and Enter cannot alter the document. R100 preserves geometry refusal/Kernel detail; R1.5 recovery and Cancel leave document unchanged. Narrow error screenshot reviewed.
- Existing varying chain regression PASS at its 1440×1000 viewport: closed-rim refusal, one open straight-edge R1→R3 preview with separately labeled scope radii, strict native geometry/volume/contact checks, Apply, Undo/Redo, actual Save and fresh Open. Varying screenshot reviewed.
- Existing constant-scope test expectation now reads the Radius input instead of a duplicate summary row. The varying regression's old `one open chain` assertion was updated to the already-current `an open chain` recovery wording; no product recovery change.

## Limits

No new Fillet topology or radius capability. Constant browser flow validates preview/refusal/recovery/Cancel, not a new constant Apply lifecycle in this task. Distinct independent edge-radius groups and assistive technology not exercised. #126 WIP untouched.

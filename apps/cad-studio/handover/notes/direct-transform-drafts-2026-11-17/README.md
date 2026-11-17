# Remaining Direct Transform drafts: one local cause, operation-specific guards

Bounded #29 improvement. Angle, Scale Factor, Stretch X/Y/Z and Shear factor previously retained a numeric value when their visible NumberField became blank. These six fields now keep raw drafts owned by exact direct geometry plus a stable sorted selected-ID signature. A small local TransformDraft handles display; each operation checks only its own finite inputs. Invalid Rotate does not disable Scale or Duplicate. Duplicate does not consume numeric inputs.

The existing Model still decides Scale/Stretch positive-factor and Shear different-axis rules. Finite zero/negative values are forwarded unchanged, not clamped or preapproved. Axis selection lifetimes, Move slot, REGION, Extend, shared NumberField, CurveTools At-t/Split and all native/Model code are unchanged. No public schema or geometry capability was added. #29 stays OPEN and HOLD/WIP remain preserved.

## Six-field change map

| Field | Consumer | New UI rule | Existing Model decision |
| --- | --- | --- | --- |
| Angle ° | Rotate | finite raw angle | existing rotation/affine admission |
| Factor | Scale | finite raw factor | positive factor required |
| × X | Stretch | all three stretch inputs finite | every factor positive |
| × Y | Stretch | all three stretch inputs finite | every factor positive |
| × Z | Stretch | all three stretch inputs finite | every factor positive |
| Shear factor | Shear | finite raw factor | distinct along/by axes and finite factor |

## Actual acceptance

- `/tmp/cad-scale-draft-before-01`: first diagnostic PASS. Empty Factor with enabled Scale applied retained 2. This is defect reproduction, not successful-product acceptance.
- `/tmp/cad-scale-draft-after-01`: first fixed PASS. Empty Factor disables Scale and displays its local reason. Explicit 1.5 still executes while Angle is blank (Rotate disabled, Duplicate enabled). Object ID/name, original source strings, nodes and outputs preserved; Undo and Redo restore exact documents.
- Independent Python parses the exact current geometry-ID surface block, not first/last geometry. D347 control-point bounding-box centre is independently fixed at [11.5,-5,17]. All 4 result poles equal c+1.5(p-c): [[4.75,-14,11],[4.75,-14,23]], [[18.25,4,11],[18.25,4,23]]. No new broad transform accuracy claim.
- Final oracle retains historical basename retained-two, but its explicit input and result are factor 1.5. The final image shows reset Factor 2 after successful execution; 2 is the next default, not the executed scale.

Successful operations/Undo/Redo or other direct-owner replacement intentionally reset raw fields to defaults (90,2,1,1,2,0.5). This is render-current draft ownership, not arbitrary captured stale-callback rejection. Axis state is unchanged.

## Checks and qualifications

Focused 8/8 (new 1 + adjacent 7) first PASS. New matrix covers all 6 fields × blank/whitespace/NaN/±Infinity; direct invalid handler invocation; unrelated operations and Duplicate availability; exact finite callback payloads; equivalent selected arrays and two-ID order reversal retaining drafts; selection/source reset. Callback forwarding is not native producer success.

Studio tsc, targeted lint, driver syntax PASS; build 5.77s PASS. Logs included as .txt. Actual source capsule 527 unchanged, errors/consoleErrors/changes empty, context/browser/server cleanup before freeze release. Curated receipts preserve original receipt hashes and source hashes. No failed run in this baseline/final pair.

Before/after PNGs inspected by implementation agent and root reviewer: blank enabled versus blank disabled with reason, then scaled panel with reset fields. Synthetic fixture and no personal data. Actual Rotate/Stretch/Shear native execution, multi-selection rendering, Save/freshOpen and captured callback injection are NOT RUN here. Scale is the sole representative actual operation; other operations have focused input/scheduling coverage, not a new geometry qualification.

The historical driver limit says pole translation; the implemented and retained oracle performs centre-based scaling, not translation. No driver assertions were changed after the run.

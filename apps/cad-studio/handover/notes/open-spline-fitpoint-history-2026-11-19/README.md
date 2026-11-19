# Open Spline numeric fit-point draft history (#21, partial)

## Observed gap and bounded change
The actual three-click open Spline followed by Select accepted Fit point 2 Y edits from 20 to 25 to 30, but Undo remained disabled. This is a missing draft-history step, not proven saved-document loss.

Only a completed independent, unconstrained three-fit/five-vertex automatic-handle spline with exactly one changed fit coordinate is admitted. Existing generated geometry and metadata must agree exactly; source/document/generation ownership checks remain in place. Explicit handle edits, closed/longer/linked/constrained shapes and placement retain their original paths. No geometry algorithm, snapping or formatting change.

## Verification
- Focused independent boundary/replay tests: 6/6 PASS; scoped lint PASS.
- Actual numeric edits, Undo twice, Redo twice, same-string no-op and exact requested fit interpolation: PASS on original and latest-main-integrated product.
- Existing open Arc Radius and open Line lifecycle regressions: PASS.
- Existing closed Spline handle/native/Undo/Save regression: PASS after entry-only fixture correction.
- Final latest-main-integrated Model type-check, Studio type-check and Vite build: PASS.

## Preserved failures and limits
The first closed Spline regression never entered Sketch because its old Space/palette-input entry no longer matched the observed UI. Only its entry was replaced with the visible Sketch mode button; all downstream oracles remain unchanged. Its first attempt failed, and subsequent stages were NOT_RUN.

The initial Studio type-check rejected two deliberately malformed `fromSpline:false` test objects (the typed flag is optional true). Only their explicit unknown-cast boundaries changed. Product code and assertions were unchanged; Vite was NOT_RUN in that attempt.

For this new open-draft path, native curve/solid, Finish and Save are NOT_RUN. Fit-point interpolation is not an independent full-biarc oracle. The closed spline lifecycle regression does not remove these limits. Actual coverage is Fit point 2 Y and identical-string no-op; other coordinates and ownership counterexamples are unit/code-review coverage. #21 remains OPEN.

## Synthetic screenshots
- baseline.png: Y30 applied with Undo disabled before the change.
- undo.png: two Undo operations restore Y20, with Redo available.
- redo.png: two Redo operations restore Y30.

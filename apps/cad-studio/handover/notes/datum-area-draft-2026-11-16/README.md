# Datum Area late size edits (#70)

A new area target retains its picked centre/identity but now takes the latest editable Circle diameter or Rectangle width/height until symbol placement. Valid changes update the pending target. Invalid changes retain the last valid pending geometry but cannot be committed: final placement validates the current draft again. Existing saved-target symbol moves do not take dimensions from the new-target controls. Kind-change cancellation remains unchanged.

## Verification

- Helper unit PASS: circle/rectangle replacement, centre/identity and original immutability, invalid/blank/nonfinite sizes, unrelated-kind identity.
- New helper/test lint PASS; Studio typecheck/build PASS. Initial unit union-property assertion corrected before final checks.
- DrawingWorkspace lint reports five pre-existing unused bindings (DrawingFix, _sig, _was, _leader, _sheet). Running ESLint on the parent-commit file through stdin reproduces the same five; no clean whole-file lint claim.
- Chrome WebGPU 1024×900 and 1440×900 on the bracket Front view: select circle centre at [15,3] with diameter 4, reject late 0 without saving, change to 8 before symbol placement, confirm saved diameter/centre and actual SVG Ø8. Rectangle 4×2 changed after centre selection to 10×6, saved and actual SVG match.
- Undo/Redo, actual Save and fresh Open/export preserve both target sizes. Moving the existing Ø8 target while the new-target draft says Ø12 keeps its saved Ø8. Pending new-target edit followed by Escape preserves the document. Narrow screenshot reviewed.
- Existing datum-target-kinds browser regression PASS at 1440: overlapping point endpoint selection/focus, circular area and line targets, Undo/Redo, Save/fresh Open, independent SVG oracle for target symbols/phantom lines/hatching.

## Limits

No PDF/DXF, other browser or screen-reader claim. Area dimensions intentionally may extend outside the part; the existing off-part warning remains. No saved-format changes or #126 WIP changes.

# Retain dimension selection through tolerance blur (#617)

Baseline: `2564774ebdc25ef6ab2b42315b83d86cc03a3d67`.

## Cause and bounded change

Focusing the clicked dimension button on pointerdown blurs the tolerance input.
The blur saves the old dimension and can change issue/list height before
pointerup, so the browser's click lands on the common list ancestor instead of
the intended button. The value is safe, but the first selection is lost.

For a primary pointer, defer default focus until the actual click. In click,
focus the pressed button first (committing the old field), then select its
captured dimension ID. Native buttons, pressed state and keyboard click remain.
No selection occurs on pointerdown or a cancelled pointer. No drawing numeric,
geometry, tolerance rounding or document schema behavior changes.

A pointer-capture experiment passed the original case but was not kept because
it could change drag-out cancellation. The final approach preserves that case.

## Verification

- Chrome 1024x1000 and 1440x1000: first pointer click after d1 tolerance blur
  selects d2; d1 alone receives 0.35. Reverse 0.35 -> 0.1 reflow also selects on
  the first click. Clicked button keeps focus.
- Keyboard Enter and Space activation, Escape cancellation, invalid -1 refusal,
  independent d2 Enter edit, repeated switching and drag-out cancellation pass.
- Undo once restores each pre-edit document; Redo restores it exactly, without
  extra history or cross-dimension values.
- OPFS Save from Model mode, fresh-context public Open and return to Drawing
  preserve d1=0.35 and d2=0.22 and their original references. No downloads.
- Baseline DimensionsList was byte-identical in the isolated pre-fix QA copy
  (SHA256 `6dc41c057c96dcc5c9d54d99cbfb5a658bd38c4cfdd647cd1b0c6d64c343670f`).
  That copy fails the exact first-click assertion: symmetric remains instead of
  None. Final browser run passes with no page/console errors or source changes.
- Existing Studio drawing-commit-roundtrip and drawing-delete-policy: 7/7 pass.
- Changed-file lint, Studio tsc, Vite production build and diff check pass.
- A test-only initial save attempt looked for Project and versions while still
  in Drawing. Corrected to the supported Model -> Project path and reran all
  cases successfully. The failing run was not counted as a product pass.
- Screenshots inspected. #126 pre-existing WIP was untouched and excluded.

Regression: `test/drawing-tolerance-selection-browser.mjs` with
`TOLERANCE_SELECTION_SOURCE_FROZEN=1`, existing PW_DIR/CHROME and heavy gate.

Not run: full suite/CI, touch/mobile, screen-reader software, export/PDF or all
annotation families. Desktop keyboard focus/activation is tested, not a claim
of comprehensive accessibility certification.

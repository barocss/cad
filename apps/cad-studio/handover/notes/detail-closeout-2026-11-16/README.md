# Drawing view closeout (#34)

## Last concrete defect
An automatically placed Detail authored an `at` override and Undo entry on a stationary click. Preserve the exact initial paper position for stationary/retraced pointers, and commit only a real displacement. Actual movement retains 0.1 mm snapping. Original identity, unique detail ID and live document/model/sheet ownership guard final application. Other drag branches and Escape cancellation are unchanged.

- Baseline actual Studio: `cad-detail-noop-baseline-01` reproduced the mutation.
- Fixed actual Studio: `cad-detail-noop-fixed-01` PASS: click keeps complete document and Undo state; real drag changes placement; Undo/Redo round-trip.
- Focused paper drag/position tests: 7/7. Default Studio typecheck and helper/test lint PASS. DrawingWorkspace retains its three pre-existing lint errors (DrawingFix, _leader, _sheet).

## Actual historical file
The original `06-lost-diameter.bcad` from the prior Detail diameter failure was located and read without modification. SHA-256: `bc1dd3656b39d2a25b5984452cec15b2e8fa96fa60b307bdb20e9e6f4b53fec0`.

`detail-legacy-file-reconnect-browser.mjs OUTPUT ORIGINAL_FILE` pins that hash. Actual Studio `cad-detail-historical-reconnect-01` PASS:
- Opening preserves lost `n1.bottom|n2.side0#2`; no silent ref substitution.
- Explicit Reattach picks visible clipped top arc, preview leaves the document untouched, confirmation changes only the intended diameter reference/near point.
- Other dimension, crop, scale, placement and feature history preserved; Undo/Redo pass.
- New part then native JSON Open of repaired in-memory document passes. This is NOT a Project Save/disk-read claim.
- Actual SVG/DXF commands captured in memory before browser delivery; no physical downloads.
- Independent Python XML/DXF reader verifies arrow tip (307.5, 94.6825), on source R20 and crop R10 circles, diameter 8 and DXF paper diameter 40, plus original top-diameter control.
- Reopened screenshot visually reviewed.

## Completion scope
Together with broken-view-picking, section-current-endpoint, section-reference-reason, detail-crop-edit, detail-paper-position, detail-paper-export and detail-diameter-reconnect notes, the explicit #34 boundaries are covered: displayed/picked ink agreement; accurate section loss diagnosis; adjustable cross-sheet placement and SVG/DXF matching; original saved loss preserved with explicit reconnection. Independent closeout review agreed.

Other-scale, section Detail and WebGL2 combinations remain wider NOT_RUN QA, not claims of a full renderer matrix. PDF/physical delivery HOLD is unchanged. #35 analytic precision remains unresolved; no arbitrary numeric rounding was added. Existing protected #126 worktree and all HOLD scopes remain unchanged.

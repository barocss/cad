# Issue21 original acceptance audit

Read-only comparison of the original desktop checklist ranges with current code and retained evidence. No prior PASS is presented as a new execution. Paths below are sibling note directories.

| Original concern | Retained evidence / current boundary |
| --- | --- |
| Ellipse dimension guidance; rim blend availability963–968 | ellipse-axis-recovery-mac-2026-11-15, ellipse-direct-dimension-guidance-2026-11-14, ellipse-rim-fillet-admission-2026-11-14. Guidance fixed; native ellipse blend limit remains. |
| Slot draft Undo974 | slot-panel-draft-history-2026-11-14 covers each Length/Width/Angle Undo/Redo. |
| Slot reopen975–979 | slot-authored-reopen-2026-11-14 covers authored metadata and coupled Width16/R8 Save/Open. Legacy metadata-free or mismatched loops intentionally reopen as generic outlines; old arbitrary geometry is not inferred into a Slot recipe. |
| Fixed triangle1098–1109 | fixed-triangle-panel-draft-history, fixed-triangle-reverse-draft-history, fixed-triangle-feature-editor (2026-11-14) cover all three inputs and same-draft reversal. |
| Separate outlines1118–1124 | cross-outline-dimension-boundary-2026-11-14 gives explicit unsupported boundary and preserves first pick; no cross-outline solver added. secondary-outline-length-reopen-2026-11-14 preserves supported secondary straight region lengths through24→26/Undo/two Save/Open cycles. |
| Saved Perpendicular1163; Round tangent1182–1184 | saved-perpendicular-reference-admission-2026-11-13 rejects malformed stored relation; round-selected-tangent-restore-2026-11-14 restores selected adjacent line/arc joint through Undo/Save/Open. Arc-to-arc authoring not newly qualified. |
| External Open1173–1174 | PASS: [exact historical pending R8 replay](../pending-sketch-file-open-2026-11-16/README.md). Keep editing and Escape retain R8 and accepted state; explicit Discard opens the second file; Undo restores the first document and filename, and actual detached Save proposes the first filename with exact original JSON. Redo restores the second file. Explicitly discarded draft restoration and camera framing are not claimed. |
| Conflict source/removal1561,2377 | opposite-length/circle-distance/edge-circle-distance/fixed-point-distance-conflict-focus (2026-11-14). |
| Offset/Band draft Undo2351/2366/2369 | sketch-profile-offset-draft-history, sketch-make-band-draft-history, sketch-edit-band-draft-history (2026-11-14). |
| Linked Model outline/hit2361 | Native/edit geometry is current but Model rendering/picking uses stored coordinates. Actual reproduced on c3d6370ff in linked-profile-current-browser --baseline. Fix/acceptance tracked in linked-profile-current-2026-11-16. |
| Shared-edge label/diagnostic2645–2653 | shared-edge-dimension-label-hit and overlaid-edge-edit-selection (2026-11-14), plus adjacent-sketch-dimensions. |
| Mobility2899–2907 | [Coordinate feedback](../sketch-coordinate-feedback-2026-11-16/README.md) now explains the tested straight width-locked rectangle X51→50 result, with successful Y input and Undo/Redo/Cancel clearing the owned status. No indirect constraint is attributed. straight-outline-local-mobility-2026-11-13 remains first-order entity participation only, not movement direction, drag editing or curved/compound mobility; those are not promoted to implemented. |
| Constraint filtering3206–3219 | constraint-removal-focus, constraint-picked-undo, constraint-active-circle-distance (2026-11-14), circle-picked-undo and multiple-outline-circle-filter (2026-11-16). |
| Round3387–3391 | Existing lock-order/free-fillet/oblique plus historical-round-recovery-2026-11-16. Authored-coordinate oracle PASS; ideal-coordinate comparison FAIL remains distinct. |
| Offset3397–3412 | sketch-offset-final-arc-radius, nested-sketch-offset-admission, reopened-inner-offset-target, outward-offset-hole-constraints (2026-11-14) cover safe acceptance or explicit refusal. |

#21 remains open. New evidence must distinguish exact historical files from newly authored metadata; do not reverse-engineer missing intent or widen solver/kernel scope to convert every older NOT_RUN into PASS. Broader device/DPI/browser coverage is separate from known functional failures. Protected WIP/HOLD unchanged.

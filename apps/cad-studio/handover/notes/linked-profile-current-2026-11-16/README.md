# Current linked free-sketch display and picking (#21)

Original checklist row 2361 was reproduced, not inferred: a 40 × 24 × 8 box with a linked face outline and 2 mm inset retained its old Model overlay after Width changed to 60. A real pointer at x=59 picked the box face while x=39 picked the stale sketch. Edit Sketch already resolved the current geometry.

`freeSketchProfile` now uses the existing canonical associative/pocket resolver for both display and hit testing. Resolution and profile caches are scoped to immutable document identity (and profile parameter identity). Missing source links yield no stale selectable profile. The stored linked node and source extrusion are not rewritten; no topology inference, schema, worker protocol, or kernel change is introduced.

## Verification

- Focused native tests: 3/3 PASS, including current rings, new-document identity, lost source, unchanged ordinary/parameter refusal behavior.
- Studio TypeScript and targeted ESLint: PASS.
- Production build: PASS (3.87 s).
- Actual Chrome baseline: confirmed stale x=59/x=39 selection (`linked-profile-current-browser.mjs --baseline`).
- Actual Chrome fixed: PASS. Width 40 → 60, exact Undo/Redo, then Width 64; new strip picks sketch and former strip picks face. Saved JSON, fresh Open, current picking and unchanged stored associative/source nodes verified.
- Reopened-width-64 screenshot reviewed: outline/inset span the current box; selected Sketch 3 and bounds 64 × 24 × 8 agree.
- Driver requires `LINKED_PROFILE_CURRENT_FROZEN=1`; source was frozen throughout each browser run.

This fixes row 2361, not every #21 acceptance item. See the adjacent sketch-constraints audit. Exact historical pending R8 → external Open → Undo/detached filename/Save evidence remains outstanding; legacy Slot intent and mobility directions are not inferred or newly implemented. The historical ideal-coordinate Round comparison remains FAIL at the unchanged 1e-7 threshold, separately from its passing authored-coordinate oracle.

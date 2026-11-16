# Hole selection guidance (#88)

Zero selected faces still asks for the flat entry face. Multiple selected faces now asks the person to leave only one flat entry face selected. The shared command availability rule still refuses non-axis-aligned or curved entry faces; no Hole geometry support changed.

## Verification

- Hole model suite: 7/7 pass, including zero/multiple/single/tilted availability and unchanged selection.
- `HOLE_SELECTION_FROZEN=1` desktop Chrome regression `test/hole-selection-guidance-browser.mjs`: PASS at 1024×900 and 1440×900. Actual canvas picks, Faces filter, Top then Shift-Front. Search shows distinct guidance; Enter retains search, document and both selections. Single-face recovery previews, cancels without mutation, restarts via H and applies Ø4 through. Undo/Redo and native Save/fresh Open pass. Native strict B-rep and independent analytic volume `40*30*10 - pi*2²*10` agree.
- Changed-file lint and Studio type-check/production build pass.
- Screenshots reviewed for narrow search and reopened geometry.

First browser attempt used Pick all and a face-centre control handle, opening Extrude edit rather than adding a second face. Test corrected to the issue's Faces filter and off-handle coordinates; final production code unchanged during successful run.

## Limits

Box fixture, not the original Bracket-01. No separate ribbon-disabled-tooltip or assistive-device pass. Native geometry support, selection behavior and palette refusal behavior are unchanged. Existing #126 WIP is excluded from this change.

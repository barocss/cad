# Recover a lost named Hole entry during Split History (#26)

## Reproduction and contract

A 40×30×10 box, Split normal[2,2,0]/At70 and negative-side Hole centre[10,10], radius2, depth4, face `n1.top` is valid. Changing only Split to normal[0,0,1]/At5 removes that top face from the negative target. Native returns REFERENCE, feature n3, exact detail `no face n1.top on the target`. The Hole object, parent side and named entry remain unchanged. This differs from the earlier SELECTION/material-miss test. A named Hole entry takes priority over axis/side; it must not silently fall back to the new maximum face.

Actual baseline Chrome preserved the accepted document but showed only generic kernel advice, with n1.top hidden in Kernel detail. The fixed History feedback names the lost entry and directs the user to restore Split At/Normal or Reset, explicitly stating that the Hole reference has not changed. Native detail/code/failed-feature attribution remain available. Enrichment requires the same Split ID, unchanged other nodes, a downstream dependent Hole, its saved nonempty face, REFERENCE, and the exact matching native detail. Existing request ownership guards are unchanged. No topology, reference matching, automatic relinking or accepted document change.

## Verification

- Native error independently reproduced; actual baseline and final Chrome receipts retained at /tmp/cad-split-lost-entry-baseline and /tmp/cad-split-lost-entry-final01.
- Focused tests10/10 PASS: real native missing face, exact-code/name/detail matching, unchanged Hole and dependency guards, original material-miss behavior and History request ownership.
- Studio TypeScript, affected lint and production build3.97s PASS. Read review found no blocker.
- Final actual Chrome PASS: visible face-specific refusal and original native detail/failed Hole, accepted document and Undo/Redo availability unchanged, Reset restores all normal components/At, subsequent At80 applies with exact original Hole, independent aggregate volume12000−16π, Undo/Redo, in-memory file reopen retains n1.top. No runtime errors/downloads. Refusal screenshot visually reviewed.

## #26 acceptance disposition

The original selected-face/body, replacement, result-side, appearance, History and Undo requirements are mapped in ../split-history-source-handle-2026-11-16/README.md. The additional comment's zero-normal/current-plane requirements are covered by ../split-history-plane-admission-2026-11-16/README.md; its final lost named entry requirement is covered here. These bounded reported cases now have evidence.

This does not claim arbitrary non-axis face picking, placed targets, face-linked Mirror, unrestricted downstream side changes, full suites or CI. Those NOT_RUN extensions are not silently promoted to delivered features. Existing WIP/HOLD preserved.

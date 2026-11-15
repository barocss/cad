# D1359 — Preserve overlaid-line inspection on Trim refusal

Completes barocss/cad#134. Base main `1996b905efb5fc15b822923cc8248a796739fee8`.

## Existing boundary and correction

Direct Trim still requires a new sketch without stored edge IDs. `directTrimReadiness.ts` shares that exact existing condition between execution and controls. Select remains available. Unsupported Trim is focusable aria-disabled, visually muted, and described by one nearby recovery explanation. `trimSelectedEdge` returns success only after synchronous draft replacement. `useOverlaidLines` clears the owned scan only on success; native refusal retains group, occurrence, highlight and mounted focused button. Native planner/geometry/IDs and existing stale-generation guards are unchanged.

## Verification

- Focused6/6, Studio tsc, scoped lint, diff check and production build PASS. Final styling change rebuilt and relinted.
- Actual Chrome1024/1440: stored e8 Trim is inactive, Enter preserves scan/highlight/focus/document, Select→Dimension10→8 remains available. Draft Undo/Redo and final sideTags e1–e8 preserved; native output check and360 mm³ pass, then actual Save/fresh Open.
- Real new-sketch midpoint crossing causes native Trim refusal: same scan, selected occurrence, highlight, geometry, document and keyboard focus remain. Select stays available.
- Supported new-sketch direct Trim clears its scan on success; removing both shared occurrences and extruding yields valid native output400 mm³; actual Save/fresh Open passes.
- First browser run passed functional cases. Visual review found aria-disabled needed a visible cue; only opacity/cursor styling was added, then both widths were rerun with frozen final product. Root reviewed final1024 restricted button and1440 late-refusal focus screenshots.
- Final receipt `d1359-second/receipt.json` SHA256 `f01854f06094a71c224c3726321e0811af05f494e7d15f7bd0d0cf0d3de92230`.
- Older overlaid-lines browser stored-refusal expectations now assert inactive Trim and retained Select; syntax checked, not fully rerun in all historical modes.

No full-suite, CI, screen-reader, arbitrary-profile or direct-Trim support expansion. Existing HOLDs retained. Next D1360/#133, stale Cut line gap refusal when a valid preview replaces it.

# D1346 — Keyboard cancellation focus (#93)

## Bounded change

Extrude remembers its initiating rail, Browser or History button. Cancel/Escape restores teardown-lost focus to that button; History free-sketch Close editor returns to its initiating History control. A connected, visible, enabled opener wins, otherwise the existing Browser control is the fallback. Changed Open/document scope, active command/editor or newer user focus blocks restoration. Hole focus behavior, selection, geometry and applied-command behavior are unchanged.

## Verification

- Ten focused editor/reference focus tests PASS; Studio TypeScript, helper/test lint, diff check and production build PASS. Existing App unused lint finding unchanged.
- Actual source-frozen Chrome/WebGPU1024/1440 with free semicircle R10 and rectangle sketches: Browser Sketch1 Enter, rail Extrude Enter, keyboard Cancel returns to rail with unchanged document and selection. History Sketch1 Enter then Close editor Enter returns to History. E from that History button then Escape from Distance returns to that same button.
- Extrude5 remains bound to Sketch1, independent analytic volume250π mm³, with Undo/Redo and actual Save/fresh Open. Actual narrow screenshots reviewed: visible rail/History focus rings and selected Sketch1, no editor/HUD left open.
- First browser run used a feature-only data-node-index selector absent on free sketches; corrected test selector. Second run asserted focus before its animation-frame handoff; corrected test to wait for the observable focus outcome. Third run PASS. Receipt SHA256 `5e7c9aa4c6c67a7399a32eeeaec85f6413bc827f928a380c05f01f5eafb82c92`.

No assistive-technology or post-Apply focus qualification. Opener removal fallback is controlled-test coverage, not an actual consumed-sketch browser claim. Existing HOLD unchanged; next #94 focused Extrude shortcut/selection guidance.

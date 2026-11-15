# D1347 — Contextual Extrude keyboard help (#94)

## Bounded change

The primary Extrude rail uses existing shared tooltip focus/hover support and aria-describedby. Its helper reads the same native Extrude availability/profile resolver to identify default latest-unused Sketch, explicitly selected Sketch/region or selected planar face. Browser selection guidance and E shortcut appear on demand, not as permanent prose. Unavailable Extrude stays keyboard discoverable with aria-disabled and its refusal reason; stale models do not invent a target. Other tools and native geometry/selection logic are unchanged.

## Verification

- Five focused tests PASS: default/explicit selection, multiple/no profiles, stale state, actual native planar face and native curved-cylinder refusal. Studio tsc, changed-file lint, diff check and production build PASS.
- Source-frozen actual Chrome/WebGPU1024/1440: actual Tab to Extrude sets aria-describedby and shows E plus Sketch2 default; pointer hover uses the same description. Browser Sketch1 Enter changes the help target. Default5mm rectangle volume1125mm³ and explicit semicircle250πmm³ prove target agreement. Undo/Redo and actual Save/fresh Open PASS.
- Real Top-view pointer click selected the semicircle planar cap; focused/hovered help identifies the selected face. Empty-document Extrude remains focusable with required-selection guidance. Actual narrow default/face/unavailable screenshots reviewed; no permanent help row.
- Browser first run PASS. Receipt SHA256 `26786f75a8731503288220649e30e6ae89f9afaee26f0d087b9c089a4e18adb2`.

No assistive-technology qualification, curved-face browser claim or full-suite/CI claim. Existing HOLD unchanged. Next #135 Sketch Offset closed-contour action readiness.

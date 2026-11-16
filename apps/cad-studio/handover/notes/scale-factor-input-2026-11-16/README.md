# Scale factor input and small drag recovery (#54)

Base 3215987592d7fee8aa863589b4e73ee7e67b4afd; 2026-11-16.

Creation and History now share a unitless finite 0 < Factor <= 1000 rule. Native input bounds include existing valid .005; custom validity excludes zero and the field owns numeric correction guidance. Geometry-specific small-result failures still retain their kernel diagnostics. The History field is k (the serialized property is factor).

Command gizmo scaling no longer rounds the final factor to two decimal places. It preserves a positive small product at 12 significant digits, caps the public maximum 1000, and guards floating underflow from becoming zero. The cursor labels its existing multiplier explicitly as relative. No kernel minimum-size policy is relaxed.

Validation:
- Focused lint and final TypeScript/Vite app build PASS.
- Scale factor/helper plus Draft-angle shared-rule regression: 2/2 PASS.
- Extended scale-admission-browser PASS at 1024x900 and 1440x900: creation/History reject 0, -1, 1001 with native validity and disabled Apply; .005 accepted and re-applied through History. Strict native box: 1 body, 6 faces, 8 finite vertices, volume .000072 mm3. Undo/Redo, Save/fresh Open retained.
- Existing geometry-refusal controls 5e-9, 1e-8, 2e-8 remain refused without document adoption. Legacy invalid small-result file remains marked stale and is repaired through History at .005.
- Actual Shift X-cube drag from .1 across the pivot now finishes at .001, not zero; cursor says relative. Recovery to .1 applies volume .576 mm3, with Undo/Redo.
- Inspected narrow History geometry refusal screenshot: diagnostics retained.
- Evidence /tmp/cad-scale-factor-r3-20261116; final build /tmp/cad-scale-factor-build-r3.log.

Intermediate corrections: first type build caught an overbroad text replacement in Draft-angle return; corrected and unit-tested. First browser run exposed the History key mismatch, corrected to k. Second run hit test double-close after successful Apply; changed the driver to await the editor closing itself. Both widths passed final rerun.

Limits: browser drag coverage is X-axis Shift only; centre/vertical and broad curved imported geometry are not newly qualified. No assistive-technology claim. Kernel/native geometry refusals preserved. #126 protected WIP untouched and excluded.

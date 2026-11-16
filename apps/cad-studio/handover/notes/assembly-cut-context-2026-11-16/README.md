# Assembly Cut contextual recovery (#60)

Base: 8140d27600f5dc222433fa64524636ed5e146ef3. Desktop Chrome, 2026-11-16.

- Parts/Add selected owns the empty-target recovery guidance. Only the exact empty-target problem is suppressed from the separate alert; other numeric/geometric refusals remain visible. Cut remains disabled while invalid.
- Circle omits rectangle-axis help. Details describes the current Through or finite-depth extent and retains the definition/mate-reference caveat.
- Through hides the inactive Cut depth input without changing its draft. Toggling off restores the prior value.

Validation:
- App TypeScript/Vite build PASS.
- Focused ESLint (both changed product files and browser driver) PASS.
- Existing assembly-cut unit tests 7/7 PASS, including geometry trial refusal.
- Extended assembly-cut-browser PASS. Context checks at 1024x900 and 1440x900 cover missing targets, single guidance, disabled Cut, profile-dependent copy, Through hiding/restoring 7 mm, blank-radius refusal even with no targets, re-add selected and Cancel with unchanged document.
- Existing actual two-plate circular through-cut lifecycle still passes: apply both, edit to Plate 2 only, Undo/Redo, Save/fresh Open, delete. Independent zero-product-import Python arithmetic checks placed-volume output: each cut plate 11748.672587712826 vs analytic 11748.672587712817 mm3; source part definitions and placements unchanged.
- Inspected 1024 context screenshot.
- First browser attempt failed before exercising the HUD: Space was consumed by the focused outliner row instead of opening the palette. Driver now blurs the row before the keyboard command; rerun passed. Product keyboard behavior was not changed.

Evidence: /tmp/cad-assembly-cut-context-r2-20261116; build /tmp/cad-assembly-cut-context-build.log.
Limits: no screen reader/mobile, new rectangle cutting kernel claim, manufacturing/equipment scope, or new cut capability. #126 protected WIP excluded.

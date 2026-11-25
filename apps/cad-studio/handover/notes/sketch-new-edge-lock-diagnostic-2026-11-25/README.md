# D1983 — Name the attempted edge length in the Sketch panel

P1 rows 09 and 16, [#21](https://github.com/barocss/cad/issues/21). On a plain closed straight outline, an attempt to add a redundant edge length used to show “That is already implied” without the attempted edge or value. The panel now retains the Model's named refusal when adding a new lock. Existing valid applies, edits to driving edges, fixed triangle recovery and opposite-edge conflict targeting retain their routes. This adds no constraints or new solver behavior.

- **Previous desktop:** the proven opposite-edge conflict already named the attempted dimension and offered the existing lock as a recovery target. The same-position 60 mm attempt on edge 3 displayed the anonymous “That” refusal.
- **Actual Chrome PASS:** with edge 1 fixed to 60 mm, edge 3 = 50 mm is a proven conflict and edge 3 = 60 mm is implied. Both alerts identify the edge and value, leave all points and length inputs unchanged and do not claim the attempted lock exists. A triangle outside the inconsistency proof names edge 3 = 30 mm, but calls it nonconvergence rather than a proven conflict.
- **Actual accepted control:** edge 2 = 40 mm still creates the expected 60 × 40 × 10 mm native solid, 24,000 mm³ versus the original 18,000 mm³. Undo/Redo, actual Save and fresh Open preserve the expected accepted state and the original conflicting-edge diagnosis. Three groups use the independent Fraction-based oracle; 14 actual Studio states, no runtime or console errors and 1,235 frozen sources unchanged through cleanup.
- **Focused checks:** 15 Model conflict cases and eight Studio panel/triangle cases pass. Studio type-check, scoped lint, syntax and diff checks pass.

[Conflicting attempt](studio/02-conflict.png) · [Redundant attempt](studio/03-redundant.png)

Replay with [the D350 browser driver](../../../test/sketch-conflict-proof-browser.mjs) from `apps/cad-studio` with the output directory, `D350_SOURCE_FROZEN=1`, `PW_DIR` and `CHROME`. This is a bounded Studio correction, not adoption of the standalone exact linear sketch document of #183 or completion of #21 in full.

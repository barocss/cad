# SubD Torus / Tube History (#33)

## Contract

New Torus/Tube creation stores its normalized numeric recipe on the SubD node, without a schema-version change. History exposes the existing creation fields only for an untouched terminal node whose complete node can be reproduced exactly from that recipe. It never reverse-fits legacy or manually edited cages. Node identity and outputs remain unchanged. Current-document ownership and the existing History admission/apply guards remain in force.

Counts are finite bounded integers before cage allocation; radii, length and coordinates are validated, including coordinate overflow. Actual cage changes (including chat cage edits) retire the recipe. Opening/cancelling or a no-op cage edit retains it. Undo restores the original recipe along with its cage.

## Verification

- Model focused tests: 5/5 PASS (recipe replay, identity, invalid inputs, refusal boundaries, native geometry and cage provenance).
- Studio History tests: 37/37 PASS (including shared current-document ownership/admission).
- Model and Studio TypeScript and affected-file lint: PASS.
- Studio production build: PASS, 3.98 seconds.
- Actual desktop Chrome: `test/subd-primitive-history-browser.mjs`, `SUBD_PRIMITIVE_FROZEN=1`: PASS.
  - Torus radius and subdivision edits, Tube length and subdivision edits, invalid fractional count refusal.
  - Apply, document Undo/Redo and in-memory file reopen preserve the authored cage/recipe.
  - Actual vertex, edge and face selection; Box/Smooth; cage Cancel.
  - Crease + Done retires the primitive recipe and removes its History action; Undo/Redo restores/retires it correctly.
  - No downloads; runtime/console error collection empty. Applied Torus screenshot visually reviewed.

## Scope

This resolves the reported missing creation-dimension fields for newly created Torus/Tube primitives. Legacy cages without a recipe, manually changed cages and non-terminal nodes intentionally do not receive guessed parameters. No kernel, schema migration, arbitrary cage fitting or other SubD primitive-family expansion. Protected #126 WIP and HOLD ranges untouched.

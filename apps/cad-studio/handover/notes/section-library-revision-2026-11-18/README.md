# #697 Library section geometry participates in drawing revision

Baseline: 9de29a074752a47cae02bd86e864e088cf745fcf. An issued standalone frame uses Library section R. Editing its width from 40 to 80 changes volume from 44400 to 68400 mm³ without changing nodes or parameters. The old revision marker failed to warn.

Only referenced active frame/frame-member section geometry is added to standalone stamps. Row labels/source and unused rows are excluded; ordinary inline/parameter legacy behavior and the assembly path remain unchanged. Existing row-backed node-only stamps cannot certify the external geometry, so these require explicit reissue. Saved stamps are never silently rewritten.

## Verification
- Actual Chrome baseline: expected FAIL, changed geometry with no stale warning.
- Frozen fixed Chrome: PASS, REV A warns, Undo/Redo restores exact documents, native Save/fresh Open preserves warning, explicit REV B clears warning. Images directly inspected.
- Both runs: changes=[], context/browser/server cleanup complete.
- Focused revision suites: 18/18 PASS, including override, frame-member, legacy, native roundtrip and unused-row controls.
- Owned-file ESLint and Studio TypeScript: PASS.
- Run test/drawing-section-revision-browser.mjs with DRAWING_SECTION_REVISION_FROZEN=1.

Not a manufacturing approval or universal revision certificate. Existing unrelated PDF golden/lint limitations are unchanged.

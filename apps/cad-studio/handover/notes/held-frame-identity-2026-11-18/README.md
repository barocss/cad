# #655: missing control target identity

A readable native document has no dimensions but retains a flatness control targeting `d1`. Baseline Auto-dimension allocated `d1` and incorrectly displayed that existing control on a new dimension. This does not claim normal UI deletion creates the orphan: normal deletion has its own cleanup contract.

New manual and automatic allocations reserve saved frame targets, including frames on other sheets. Existing orphan contents are not rewritten or removed. Existing attached controls and dimensions are preserved. Optional allocator arguments retain old caller compatibility; sheet context is transient, not a new file schema.

## Verification
- Baseline core and real Chrome failed the no-rebinding assertion.
- Focused model regression: 16/16 PASS (held identity, controls, composite frame consumer).
- Corrected Chrome: PASS for Auto-dimension, manual linear dimension, and continuation Top sheet. Each covers Undo/Redo, downloaded SVG, native Save and fresh Open with semantic equality.
- Independently parsed all three downloaded SVG files: dimension groups present, held control absent.
- Model and Studio type checks PASS.
- Scoped lint PASS outside DrawingWorkspace, whose three existing unused-variable errors remain unchanged.
- Screenshots reviewed for dimensions and absence of an incorrectly attached control; final continuation reopen returns to Sheet 1 by existing behavior.

The preliminary other-sheet test used a Right view with no auto dimension candidates for this box. That fixture was corrected to Top; this was not treated as a product defect. Existing PDF golden and broad qualification/HOLD limits are unchanged.

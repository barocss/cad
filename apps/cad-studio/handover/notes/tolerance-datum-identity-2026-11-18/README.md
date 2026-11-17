# #657: tolerance datum identity preservation

A valid authored/native document has datum ID `datum-A`, letter Z. Geometric tolerance suggestion A used the fixed ID `datum-A`. Baseline core generated duplicate IDs; actual Chrome on a two-sheet drawing replaced the original Z through sheet merge when Accept: Datum A was clicked. There is no claim of a UI letter-edit feature.

Only newly generated datum IDs now avoid all local and whole-sheet IDs. Suggestion IDs and letters keep their meaning. Saved duplicate data, existing datums, references, reader and merge semantics are unchanged. The new datumIds sheet context is temporary and removed before save. Stale-suggestion and cross-sheet duplicate-letter policies are outside this change.

## Verification
- Baseline focused test FAIL; Chrome FAIL on original datum preservation.
- Tolerance regressions 29/29 PASS, including conformance, Accept all, saved duplicates, and native roundtrip.
- Scoped lint PASS. Model and Studio types PASS.
- Corrected Chrome first run PASS: same-sheet and other-sheet original Z, frame-Z unchanged, new A distinct, Undo/Redo, actual SVG download, native Save/fresh Open, both sheet views.
- Independent XML parse of actual SVG: A and original Z reference text retained. The other-sheet export is Sheet 1 and its Z text is the unchanged frame reference, not the Top-sheet datum symbol.
- Screenshots reviewed: same-sheet A and Z both present; reopened Top-sheet Z remains.
- Source frozen/after/cleanup maps equal.

No broader drafting-standard certification; existing PDF golden/lint unrelated limits and HOLD scope unchanged.

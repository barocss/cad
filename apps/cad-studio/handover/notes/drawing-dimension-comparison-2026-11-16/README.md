# Drawing dimension definition comparison (#265)

## Scope

Add a collapsed, read-only detail below the existing Versions comparison, only from a saved version to the working document. Match unique dimension IDs and show additions, removals and edits with both view/sheet locations, exact stored numbers and raw definitions. Linear/radius/diameter/PCD tolerances use mm; angle uses degrees. Reference fields and stored signatures are separate facts, not inferred retargeting.

The pure helper retains absent versus explicit zero tolerance and false basic flags. It does not normalize snapshots through the Open reader. Duplicate IDs, malformed/unsupported raw data and unresolved membership produce incomplete evidence rather than guessed matches. Array order alone is not an edit. Cache identity uses both complete input documents, not model revision (which excludes drawing).

Model DocChanges, same/fields semantics, version snapshot keys/bytes, restoration, merge authority, nominal calculation and geometry are unchanged. The detail explicitly excludes nominal measurements, other annotations and manufacturing approval. Reused IDs do not certify historical identity. Sheet membership does not certify geometric reference resolution.

## Verification

- Final helper and rendered UI tests: 13/13 PASS. Includes exact precision, raw zero/false, kind/add/remove/order, references versus signatures, sheet moves/rename/order, invalid and duplicate data, stale/legacy section views and tolerance grammar.
- Existing version snapshot/ownership/MCP tests plus UI: 40/40 PASS.
- Final Studio TypeScript, targeted ESLint and Vite build: PASS (4.04 seconds).
- Actual Chrome/Studio OPFS acceptance: PASS. Real 20 x 10 x 5 box, independently expected 1000 mm3 (1e-9 tolerance); front d2 symmetric tolerance 0.1 -> 0.05 mm, top d1 unchanged. Nodes and geometry unchanged.
- Public UI Compare, detail collapse/reopen, Hide/recompare, Undo/Redo, V2 creation, saved-target/working switch, Close, page reload and reopening the same OPFS file all PASS. Detail expansion adds no Worker requests; existing Compare still requests its geometry overlay.
- Exact whole document, selection, dirty/Undo state, log bytes, snapshot keys/bytes and part bytes preserved by read-only interactions and fresh project Open. Snapshot keys: e525994ce180cccb and d6ddc2b0a8a6d9e2. Final screenshots visually inspected: definition scope, d2 front/Sheet 1 location and +/-0.1 -> +/-0.05 mm readable.

Driver: `test/drawing-dimension-comparison-browser.mjs`; run with `DRAWING_DIMENSION_COMPARISON_FROZEN=1`, PW_DIR and CHROME, while source writers are frozen and the shared heavy gate is held.

## Honest run history and remaining acceptance

First start was interrupted by executor switching; NOT_ADJUDICATED. Second failed because the driver sought the project toolbar while in Drawing mode; harness fixed to switch to Model before opening Versions. No product regression was concealed. Third and final fourth runs PASS; final receipt has no errors and confirms browser/context/server cleanup.

Actual UI sheet relocation, all dimension kinds/fit/deviation/dual-unit variants, rapid source-version switching and Open/New overtaking comparison remain NOT_RUN here (some are covered at pure-helper level). Full aggregate suite, mobile and WebGL2 are NOT_RUN. Issue remains open pending the remaining acceptance audit. Native folder and existing WIP/HOLD remain untouched.

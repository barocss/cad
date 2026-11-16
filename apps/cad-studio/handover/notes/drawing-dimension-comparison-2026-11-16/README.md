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

## Follow-up acceptance (supersedes the pending audit above)

No product code changed after implementation 860dea7c25f6998574b932411546ca817268fd0e (CI 43968673644 SUCCESS).

- Final focused matrix: helper 14 + UI 6 = 20/20 PASS. Added all five dimension kinds, tolerance absence/addition/removal in reverse, independent deviation bounds, H7→H8, raw values equal at four display decimals but unequal in storage, inch/dual presentation retaining stored mm, identical-looking definitions with different IDs and legacy-section sheet removal. Studio TypeScript, scoped lint and diff check PASS.
- Existing Model `versions.test version-tools version-snapshot-identity`: 23/23 PASS. Existing Studio version/snapshot/tool regressions remain the prior 40/40 run; no product source changed in this follow-up.
- New `test/drawing-dimension-transitions-browser.mjs`, `DRAWING_DIMENSION_TRANSITIONS_FROZEN=1`: actual Chrome first run PASS with no errors or downloads. Screenshot review confirms both sheet locations and New with no stale comparison.
- With V1 Compare active, public Drawing UI moved front d2 from first sheet to additional S3 named Inspection (number 3). The d1 top companion and all dimension objects remained exact. Deleting empty S2 and renaming S3 yielded number 2, Final inspection, without changing stable ID S3. Detail correctly shows 3: Inspection (S3) → 2: Final inspection (S3), not deleted/recreated dimensions.
- Rapid V2→V1→V2, rename Undo/Redo, external Open with identical feature IDs and New all preserve current comparison ownership or retire the detail. Read-only comparison and disclosure preserve complete Doc, selection, dirty/Undo state and OPFS log/snapshot/part bytes; disclosure adds zero Worker requests. Existing overlay remains a separate path.
- The project snapshots 5aa7e156b488502d and 62b6e475f1b6ee34 remain byte-identical across these interactions. Browser/context/server cleanup completed and source freeze released.

### Completion boundary

The issue's ten minimum feature-contract items are implemented and supported by the combined helper/UI, original OPFS and follow-up transition evidence. The first scope is stored version→working authored definitions, not all drawing changes or nominal values. The helper uses no API/schema changes and has no write, merge or retarget capability.

The test plan is not a claim of exhaustive permutations: direct sheet reorder has no public UI (pure-helper reorder PASS, public empty-sheet deletion tests actual renumbering); every dimension-kind/unit combination was not exercised in the real browser (helper/rendered UI evidence instead); injected delayed Worker responses, native folder, full aggregate suite, mobile and WebGL2 remain NOT_RUN. No unresolved product failure was observed. Closing this bounded feature does not close other drawing/manufacturing or HOLD work.

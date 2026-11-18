# Connected Line/Arc draft history (#680)

Original main `3a28c7a6c`: draw Line (10,10)→(30,10). Undo is available. Switching to Arc without changing coordinates immediately disables Undo; endpoint(30,30), bend(40,20) completion still has no Undo. This is the existing connected Arc tool, not #672 Centre arc. Draft geometry remains; this is not a saved-document loss claim.

## Narrow change

- Completed open Line/Arc tool changes retain the exact shape object. Pending bends still follow the existing implicit-settle branch. Closed shape parking/joinOpen are unchanged.
- The Arc endpoint→bend preview→explicit click uses the existing document/generation-owned placement transaction. Only completion adds one history step; keyboard Undo during its unmatched preview cannot clear earlier completed history. An initial Arc start point uses the existing point step.
- No broad history matching, coordinate/ID equivalence, kernel, inferred constraint or storage-schema change.

## Evidence

- Original unit 2 PASS/2 RED. Final connected Arc plus Centre arc/Ellipse/Slot/Circle/Rectangle/draft/selection tests 72/72 PASS, scoped ESLint and diff PASS, Studio tsc --noEmit and Vite build PASS (6.29 s).
- Actual fixed Chrome PASS: tool-only Line→Arc Undo to first point and Redo; pending Meta+Z/Control+Z preserve current authored fields; completed Arc→Line→first point→empty in three Undos and three Redos; second connected semicircle with Undo/Redo back to the exact first arc; Line closure, Extrude3, document Undo/Redo, native Save/fresh Open.
- Native independent plate volume `(20*20 + pi*10²/2)*3` = 1671.238898038469 mm³, actual1671.2388980384674. One strict-valid B-rep, one cylinder radius10 at XY30/20 with Z axis, arc endpoints at (30,10)/(30,30) on Z0/3, and matching displayed volume.
- Existing Centre arc, Ellipse, Slot, Circle and Rectangle full actual browser flows all PASS. Nine baseline/fixed/regression receipts have unchanged source capsules, zero browser errors and owned context/browser/server cleanup. Images visually inspected.
- Pending bend→Line retains the current R10 preview as an implicit placement, still without draft Undo. Escape closes the sketch without changing the accepted document. These original semantics were separately reproduced, then exact-compared in fixed code (fields, panel, visibility, Undo/Redo). They are retained limits, not newly claimed completion paths.

No failed fixed browser runs. Baseline is an observation PASS of the original missing-Undo behavior, not a product acceptance PASS. Focused tests are not the whole suite. Actual coverage is the connected open Line/Arc workflow and listed prior shape fixtures; standalone first-Arc/closing-Arc cases have not been independently claimed as native consumer coverage. Other document and cloned-owner rejection are focused test coverage. Existing HOLDs and doc-sync pause remain; this folder is task-local evidence.

Disk monitoring used a conservative2 GiB reserve in addition to the existing load-only execution gate. Final heavy run began23.3 GiB and finished24.1 GiB available. No files were cleaned for this task.

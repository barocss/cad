# Explicitly reconnect a lost Detail diameter

Bounded #34 legacy-reference recovery. Baseline `ca671e1c43ba41c79d461cd7a61969e1875d95e7` (output evidence supplement, no production difference from585da4b61).

## Reproduced gap and change

Actual Chrome opened a synthetic saved Part drawing with Detail B on A4 Sheet2, a missing edge name without signature, authored diameter placement/tolerance and an attached frame. The original dimension was retained and marked lost, but no Reattach action existed: the previous action only covered assembly occurrence losses in base views.

The current Part Detail's lost diameter now offers the same explicit rim-selection/confirmation interaction. Candidate selection never edits the file. Only visible drawable circular ink from the current clipped Detail projection is eligible; suppressed `ink:false` pieces are excluded by a repair-only picker that returns original edge identity. Confirmation revalidates the exact original, unique ID, current Detail/projection and candidate, then changes reference fields only. ID, placement, tolerance, frames, other dimensions and geometry remain unchanged.

The Detail repair captures the existing crop owner boundary (whole settings, source document, model/input, worker session, current sheet and currentness). Changing that ownership cancels the candidate. The click path explicitly enters reattachment rather than creating a new diameter. Existing creation and assembly/base picking remain separate.

## Verification

- Baseline `/tmp/cad-detail-reconnect-baseline-01`: actual lost dimension and no Reattach, original preserved.
- Fixed `/tmp/cad-detail-reconnect-fixed-02`: blank crop click has no candidate; actual visible rim selection leaves the original unchanged until confirmation. Cancel, Escape, sheet switch, Detail-scale change and New part/document replacement retire pending repair. Restoring/opening the original file does not resurrect a candidate.
- Confirm changes only the original reference; diameter count remains one, ID/place/tolerance/attached frame and source nodes retained. First Undo restores the missing reference, Redo restores Ø8, and in-memory .bcad reopening keeps the repair. No page/console errors, watched writes or downloads. Candidate and confirmed screenshots visually reviewed; confirmed sample has zero drawing issues and its attached frame is displayed.
- Existing actual assembly/base reattachment driver `/tmp/cad-assembly-reattach-regression-01` PASS, including cancellation, settings-change retirement, explicit confirmation, Undo/Redo, OPFS Save/reload/Open and captured in-memory SVG. No physical downloads.
- Focused 4/4: exact field preservation, stale originals/details/coordinates and duplicate IDs refused, invisible/suppressed/missing rims refused, mixed ink:false/drawable arc pointer test with original identity retained.
- Default Studio tsc and helper/DimensionsList/test lint PASS. Whole DrawingWorkspace retains three pre-existing unused symbols (`DrawingFix`, `_leader`, `_sheet`); old `_sig`/`_was` warnings were removed by explicit void use. Production build PASS (4.48 s; existing warnings). Diff-check PASS.

Review found that generic edgeAt does not ignore ink:false pieces; the dedicated repair picker was added before browser qualification. Initial type-check caught test-only widened boolean ink values; literal false fixed the fixture. Prior failed logs remain separate from final4/4/type/lint logs. Product source was unchanged after the browser checks.

## Limits

Only Part Detail diameter recovery is added, not Radius, Angle, arbitrary sketch references, assembly Detail or missing Detail ownership reconstruction. The legacy input is a reproducible synthetic saved-file fixture, not every historical user document. No physical export/PDF, kernel/schema or #35 precision change. Whole #34 remains open until its broader historical-file/output acceptance is reconciled. Original #126 eight-entry WIP and HOLDs preserved.

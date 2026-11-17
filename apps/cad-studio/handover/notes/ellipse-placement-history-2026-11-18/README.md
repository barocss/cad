# Ellipse placement draft history (#669)

Baseline: main `21145e8bcc1d3ce45df9a91f1644a5971442d147`. Existing Rx/Ry panel Undo is retained, not newly implemented. A completed three-click Ellipse at centre (20,15), Rx10/Ry5 had Undo disabled in actual Chrome.

## Bounded change

The final Ellipse click now explicitly records one full-draft history step. The first two clicks remain viewport-local; admission, tangent-arc construction and schema are unchanged. Repeated/mixed placement compares ordered authored owners. Ellipse parking may add `pending:false`, but all other enumerable fields and nested geometry/source identities must be identical. Regenerated coordinates, cloned nested objects, order changes, foreign document/source metadata, malformed ellipses, general polygon and Trim expansion are refused.

Undo/Redo retains the selected tool. Therefore restored shape and current placement tool can differ. The old negative test assuming Ellipse-tool/Slot cannot occur was replaced by six-direction real history sequences: Undo twice, Redo once, new placement from that restored state, Undo, explicit tool reselection, Redo and earlier Undo. No automatic tool switching was introduced.

## Verification and retained failures

- Focused 58/58 PASS, changed-file ESLint PASS, Studio `tsc --noEmit && vite build` PASS (7.43s).
- Initial focused implementation: 50/52 PASS, both Rectangle/Ellipse mixed replay cases FAIL. Current-tool preservation above fixes that boundary.
- Original completed and pending baselines PASS. Pending-only first/second click makes no authored shape; tool switch drops it. Original New part exits without a confirmation dialog and preserves the document.
- First fixed browser FAIL: fixture wrongly expected Keep editing for pending-only Ellipse. Product's existing exit predicate requires shape/done. A separate actual original-source run confirmed no dialog for both stages, with exact WIP restoration afterward. The failure is retained, not relabeled as a product regression or successful run.
- Final frozen actual Ellipse run PASS: first/repeated placement, narrow ellipse refusal, Rectangle/Circle/Slot mixed Undo/Redo and new placement replacing redo branch, first-Escape local cancellation/second-Escape exit, pending-only New part, dirty completed-shape plus second-pending Keep/Discard, foreign original document followed by fresh document Undo, existing Rx/Ry edits, Finish, Extrude3, document Undo/Redo, actual Save and fresh Open.
- Separate frozen actual Slot, Circle and Rectangle regression drivers all PASS. All four final runs retain 1075 unchanged source entries, no page/console errors and confirmed browser/context/server cleanup.
- Baseline, mixed history and reopened images visually reviewed.

## Geometry evidence and limits

Saved ellipse centre (20,15), Rx12/Ry6, angle0 and height3 preserves all 192 tangent-arc points and side IDs. Native and display body counts are one, native strict B-rep validation passes. Independent standard-library Python integrates the stored outline's straight chords plus circular-segment areas: volume **678.5841167775111 mm³**, native **678.5841167775073 mm³** (relative difference 5.53e-15). Exact ellipse area is a separate approximation comparison (relative difference 1.53e-7), not the native solid's exact definition. Fit coordinates and sampled outline deviation pass the pre-existing oracle tolerances without widening.

Native centroid/bounds are not independently asserted here; authored-outline position is checked. Sampled curve deviation is not a full-interval mathematical guarantee. Actual new ellipse coverage is axis-aligned XY; no broader ellipse blend, NURBS, centre-arc, spline, arbitrary external race or whole-CAD claim. Existing HOLDs and doc-sync pause remain; this is task-local evidence.

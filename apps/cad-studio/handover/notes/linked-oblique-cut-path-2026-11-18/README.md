# Existing #25: exact oblique linked path spans

## Scope
Linked, bounded degree-2 piecewise straight paths can use ordered non-midpoint poles off the coordinate axes. Exact binary64 integer cross products prove collinearity; there is no epsilon straightening. Temporary evaluation uses the same degree-1 locus. The authored degree-2 source and object ID are unchanged. Raw path midpoint rules and single-quadratic dispatch are unchanged.

This does not enable an earlier consumed Subtract as the source, generic curved paths, approximate collinearity, new schemas or any HOLD. Issue #25 remains OPEN.

## Actual baseline and fixed flow
- Baseline on 43e71ef7e: Open a 60×40×10 stock with two cuts and an exact two-span oblique quadratic. The latest Subtract n7 remains the source; the linked curve is excluded from Path choices. Cancel and Save/fresh Open preserve the document and native 23800 mm³ result. This is an admission gap, not data loss.
- Fixed: Spacing 10, Count 4, path endpoints [0,0,0]→[12,-16,0]→[24,0,0], middle poles [3,-4,0] and [15,-12,0]. Actual UI preview/Cancel/Apply succeeds. The prior small cut remains; the latest larger tool is translated by [6,-8], [12,-16], [18,-8] without rotating it.
- Strict native B-rep: one body, 23440 mm³, independently calculated centroid and all 48 vertices matched one-to-one within 1e-8 mm. Original eight nodes, source reference n7 and direct source are exact-equal. Undo/Redo and actual Save/fresh Open preserve the result.
- Count 6 requires 50 mm on the 40 mm path and is refused. Accepted Count 4 document, history and native result remain unchanged. Cancel, Save and fresh Open are verified after refusal.

## Checks
- Model focused API + new boundary tests: 12/12 PASS; scoped lint PASS.
- Exact off-line 1 ULP and subnormal deviations refuse, as do backwards poles and zero chords. Reverse/negative XYZ and middle-at-endpoint cases pass. Raw non-midpoint paths still refuse.
- Actual fixed browser: PASS (`cad25-oblique-fixed-02`). Existing actual decimal Stretch path regression: PASS (`cad25-decimal-regression-01`).
- Model type-check and Studio tsc/Vite build PASS. No kernel source changed.
- Source capsules frozen, no page/console errors, contexts/browser/server cleaned up. Disk remained approximately 38 GiB free.

## Failed attempts, not hidden
1. Initial new unit fixture used `curvesSource`, whose 1e-9 formatting erased the intended ULP deviation. Replaced only the fixture with exact decimal source and asserted geometryOf preserves every input coordinate. Then 4/4 and combined 12/12 passed.
2. First fixed browser passed creation/native/Undo/Redo/Save/Open, then waited for an inline error. Actual History refusal uses a toast; failure snapshot contained the exact path-length refusal and unchanged Count 4. The fixture now waits for that exact toast text. Entire actual flow reran PASS. Later stages were NOT_RUN in that failed attempt, then executed successfully in the final run.

Screenshots are actual synthetic CAD sessions, with no private data.

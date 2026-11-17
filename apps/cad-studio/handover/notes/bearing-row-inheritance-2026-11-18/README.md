# Inherited bearing row removal (#668)

Baseline main: 69b6c1d18c327ead411742c7394b0474c5abe125.

The Library Remove action deleted root row 6204 while a placed child bearing inherited it. Core evaluation of that effective child changed from success to failure. The baseline browser failed the unchanged-document assertion.

`editBearingRows` now checks placed descendants, stopping a branch at its own same-ID row. Existing root protection and row replacement are unchanged. Hidden/suppressed authored uses remain protected. Pending revision candidates and other shop-row categories are outside this change.

Validation:
- 19/19 focused bearing tests passed, including nearest override, unrelated local rows, shared definitions, unused deletion, valid replacement and original-document immutability.
- Model TypeScript and changed-file ESLint passed.
- Actual Chrome Library Remove refused used 6204 without changing the document; unused row removal, Undo/Redo and Save/fresh Open passed.
- Final browser was rerun after adding instance-bounds readiness and Frame all so the reopened screenshot shows the rendered shaft/bearing, not an early empty canvas.
- Frozen 1122-file capsule unchanged, browser/server closed, no page/console errors.
- Integration includes later main 8bff0df9d (independent sketch history changes).

Screenshots: baseline.png (old deletion), protected.png (ROW_IN_USE), reopened.png (saved part rendered).

This is a focused regression qualification, not full CAD qualification. Existing unrelated PDF golden/lint limitations remain unchanged.

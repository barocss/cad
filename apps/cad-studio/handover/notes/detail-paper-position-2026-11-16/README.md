# Recover a Detail's paper position after moving sheets

Bounded #34 sheet-move usability. Baseline `d0aa3e432cc5145a7ae07d63f4b175c3ae5309b0`.

A Detail explicitly placed on A3 keeps its `at` when moved to A4. This preserves authorship but can leave the whole detail beyond the smaller page. Pan/zoom and dragging already exist, so movement was not impossible. The missing direct recovery was a way to release the explicit paper-position override without changing the model crop or deleting annotations.

## Change

Details now has **Auto-place** (`Reset detail B paper position`). It removes only that exact detail's `at`, letting the existing automatic layout place it on its assigned sheet. Crop, explicit scale, dimensions, frames, other details and sheet membership remain intact. It is independent of the annotated-crop lock and disabled when already automatic. Oversized details are not silently shrunk: the existing no-room warning remains.

This is a recovery of the detail view position, not an annotation-aware whole-group fit guarantee. Authored annotation offsets may still need a manual drag; their existing warnings remain meaningful.

## Verification

- Focused 3/3: exact identity/no-op protection; crop/scale/controls/other-detail/sheet preservation; native A3→A4 split-sheet reset; oversized no-room without shrinking.
- Actual Chrome `/tmp/cad-detail-position-fixed-03`: A3 detail B at (350,85), radius6, scale5, diameter tolerance and standalone frame moved through Sheets to A4 Sheet2. Its box is [320,55,380,115], wholly beyond page width297.
- Auto-place removes only `at` and recovers the box to [223,14,283,74], while crop editing stays locked. First Undo restores the original off-page box; Redo restores auto placement. Already automatic button is disabled.
- Visual inspection showed authored dimension/frame offsets still beyond the right margin after this existing automatic placement. The actual Select drag then moves the recovered detail 60 paper mm left, with both annotations, into the page. The resulting screenshot was visually reviewed; actual DOM has no OFF_SHEET or DIMENSION_LOST issue. Nodes, dimensions and frames are preserved.
- New part→in-memory .bcad Open retains the manual position and annotations. No downloads, page/console errors or watched-source writes.
- Default Studio runner 3/3, default Studio tsc, lint and diff-check PASS. Production build PASS (5.30 s; existing warnings). Model/kernel unchanged.

First failures: browser run01 used strict `value===8` for a native circular measurement; it now uses 1e-9 numerical comparison without changing product rounding (#35 remains unresolved). Run02 passed recovery but visual review exposed annotation offsets beyond the frame, so run03 explicitly validates the existing manual-drag completion rather than claiming Auto-place fits everything. Initial test relative imports pulled local Model dependencies into default Studio tsc; they were changed to the established package import style, restoring default tsc PASS. Local native-alias test evidence is also retained.

## Limits

No physical SVG/DXF/PDF export or comprehensive sheet/detail matrix is claimed. #34 remains open for independent output/reconnection acceptance boundaries. Original #126 WIP and all HOLDs preserved; no golden regeneration or precision/schema changes.

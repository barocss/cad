# Circle distance: identify both conflicting axes

Focused #21 desktop Chrome/WebGPU evidence. Baseline `e038d149c2bdcf24ccace740d01ac598aa1b4df5`; product `376c230459f61f81ee75eb9b191273386cd0dcc5`. On the synthetic 60 × 30 × 5 mm plate, two radius-3 circles had fixed separation of 25 mm horizontally and 12 mm vertically. Both 26 and 30 mm centre distances were refused without changing the authored rows, geometry, or accepted document. Baseline gave a generic local-solve message; the product names both explicit constraints and their combined distance (~27.731 mm).

[Before: generic refusal](01-before-generic-refusal.png) · [After: both exact actions](02-after-both-actions.png) · [Keyboard action focuses the vertical row](03-vertical-row-focused.png)

Enter on either action focused its exact constraint row and highlighted exactly the same two circles. The user action removed only the vertical row; retry and Finish accepted exactly 30 mm centre distance with horizontal 25 mm retained and vertical separation √275 mm. Strict native result matched the independent volume of 8717.256661 mm³; Undo/Redo restored the exact documents. The baseline with manual filter/remove reaches the same native geometry. All browser and server resources closed, with no downloads, source changes during the run, or page/console errors.

This is local attribution and navigation for a proven same-pair conflict, not automatic constraint removal, a broader solver/schema change, or whole-issue qualification.

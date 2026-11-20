# Fixed triangle History: returning to the same length is a no-op

Focused #21 actual desktop Chrome/WebGPU. Baseline `1acd99a97d717530130f135c5819f0748e971a12`; product `e7bbb76ff259af5594647402702e1f38a75b83fa`. On the synthetic fixed triangle (base 4 mm, other side 128 mm, Extrude 6 mm), entering 124.05 and then restoring the authored 131.95 mm in one History editor formerly left Apply active. Applying created a new Undo state for about 7.18 × 10⁻¹³ mm of coordinate drift and discarded the existing Redo.

The fixed editor restores the authored sketch for that same exact number, disables Apply, and Enter does not consume the existing Redo. This held both with and without an intermediate refused 132.05 mm value. The older genuine 7 mm extrusion Redo still restored its exact document. A separately staged 7 mm Distance change could still apply alongside the reconverged sketch, without altering that sketch. A truly distinct 131.9499 mm edit took effect, produced a valid native solid and made a new branch; Undo/Redo worked.

[Before: Apply still active](01-before-apply-enabled.png) · [After: same number, Apply inactive](02-after-noop-apply-disabled.png) · [Existing Redo restores the 7 mm extrusion](03-after-original-redo-restores-distance7.png)

The [scoped verification receipt](verification.json) lists the checked outcomes without raw runtime records. This is not a generic tolerance, solver or History change and does not qualify other owner/geometry classes. No file download or deployment.

# Fixed span after suppressing the end-copy Hole (#20, #25)

Actual desktop Chrome: open a synthetic stock [50,10]–[54,16] extruded 8 mm, with an X Fixed span pattern (32 mm, count 3). A terminal radius-1 mm Hole starts at [84,13] on the final top face `n1.top@2`. Suppress the Hole, change only Total span to 32.5 mm in History, and unsuppress it.

- [Original](01-original-stale-center.png) (`b1c0e52e3becb35be8e3d5d428e7463d37247e43`): the last copy moved +0.5 mm, but the native cylindrical walls remained at X84 rather than X84.5.
- [Corrected, then saved and reopened](02-corrected-hole-reopened.png) (`3c846d2d24f1c658ae848e0c6eac0f1cabc0dfe1`): suppression stays active through the span edit, with no bore and 576 mm³ of stock. Unsuppressing cuts the same final face (`n1.top@2`) at [84.5,13]; native radius is 1 mm. Both versions cut 8π mm³, so volume alone does not detect the original defect. The screenshots show the scene; the exact coordinates come from the native cylindrical faces.
- Undo restores the exact moved, suppressed/no-cut state; Redo restores the exact fixed bore. Normal Save into browser-local project storage, followed by Close/reload and explicit Open of the same saved document, preserves document data and both native cylinder wall segments at X84.5. No browser download was used.

Scoped Studio tests 10/10, lint, typecheck, production build and [exact product CI](https://github.com/barocss/cad/actions/runs/44710879556) passed. This checks one terminal end-copy Hole, not general dependency retargeting or feature ownership. Existing held/Count-only behavior is covered separately by tests.

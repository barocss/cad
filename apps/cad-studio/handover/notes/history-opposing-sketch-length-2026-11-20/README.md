# History: keep an opposing sketch length conflict active

Focused #21 Chrome/WebGPU evidence on a 40 × 20 × 2 mm synthetic closed XY sketch extrusion. Baseline `24df7460ada32fa8753c9d7f94d840486ba3b5fe`; final product `6856c0536fa90f45234a3e1712edf5a025a550e1`. On baseline, entering Edge 1 = 42 mm conflicts with opposite Edge 3 = 40 mm. Changing Distance to 3 mm hid the refusal while the field still showed 42 and allowed Apply. The native accepted solid was 40 × 20 × 3 mm (2400 mm³), not the visible 42 × 20 × 3 mm intent (2520 mm³).

The final version keeps the precise opposite-lock message and refuses both Apply and Enter while the invalid value remains. A follow-up to the initial candidate also covers width 42 and Draft 1° in both edit orders; the unrelated Draft edit must not clear the conflict. Correcting the width back to 40 permits an explicit height-only or Draft-only commit. Reset and Close discard the invalid draft without adding history.

In Edit sketch, explicitly removing the opposite lock then setting width to 42 mm produced a strict-native 42 × 20 × 2 mm solid (1680 mm³). Undo and Redo restored the expected documents. No constraint is removed automatically. No downloads, source changes or page/console errors occurred during the browser checks.

[Before: mixed draft](01-before-mixed-draft.png) · [After: conflict still blocks Apply](02-after-conflict-keeps-apply-blocked.png) · [Explicit sketch recovery](03-sketch-recovery-width42.png)

This is the proven opposing edge-lock case for the owned rectangular sketch, not a general solver or History validation change.

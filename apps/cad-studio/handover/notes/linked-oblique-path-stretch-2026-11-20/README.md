# Linked Path cut pattern Stretch: explain the exact span refusal

Focused #25 Chrome/WebGPU. Original reproduction `1acd99a97d717530130f135c5819f0748e971a12`; verification base `17f72e93cd85483399a8b724484678435fbc1571`; product `17b0ccebd2e45c5eb01e22118a7f3941aa9c60e2`. The intervening changes do not alter this Stretch path. The synthetic pattern uses latest Subtract `n7`, count 4 and spacing 10 mm, requiring 30 mm travel.

With X factor 0.8, the two stretched oblique spans have nominal total length 37.318092 mm. Nonetheless, floating-point representation does not satisfy the existing exact straight-span rule. The product keeps the refusal and now distinguishes it from insufficient length, confirms that path and pattern stay unchanged, and offers a different Stretch factor or a straight-segment polyline in the existing Path field. Accepted document, history and strict-native result stayed unchanged. X factor 0.875 remained valid and updated the existing linked path, with exact Undo and Redo. The exact XY-quarter case still had the original insufficient-length refusal, and unlinked X=0.8 remained allowed.

[Before: generic midpoint message](01-before-generic-midpoint-refusal.png) · [After: linked span explanation](02-after-specific-linked-span-refusal.png) · [True short: existing length message](03-true-short-refusal.png)

The [scoped verification receipt](verification.json) contains only synthetic, reviewed outcomes. This is guidance for the exact owned linked path, not decimal Stretch support for all cases or a native geometry, tolerance or path-class change. No downloads or deployment.

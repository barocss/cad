# Pinned centre of mass: controlled Worker failure and Retry

#231 validation evidence, not a product change. Actual Chrome/WebGPU at `ec7770754a2b8fa7976c20d13c60cda661293a47`; evidence added after unrelated circular-pattern History code, tests and notes.

In a new browser context with two synthetic cubes, a test-only transport gate held the original genuine standalone mass event for the accepted resized body `b1` (epoch 1 / request 4 / revision 4). A controlled synthetic Worker error took the original Worker through its normal failure path and cleared the old pin. The UI's real Retry control created a new Worker; a genuine matching standalone mass event (epoch 4 / request 5 / revision 5) recovered the current two solids, 3000 mm³ total.

The original, unmodified trusted event was then delivered once to its original retired handler. The accepted document, selection, dirty flag, History, Undo/Redo, body mass, render and cleared pin were unchanged; the screenshots immediately before and after delivery are byte-identical (only one copy is included). Explicitly pinning the recovered bodies gave 13.25 g at (22.7735849057, 5, 7.0377358491) mm. The source stayed unchanged throughout and all browser/server resources closed.

[Controlled error and cleared pin](03-controlled-failure-pin-cleared.png) · [Recovered model after old delivery](05-retry-after-old-delivery.png) · [Explicit re-pin](06-retry-explicit-repin.png)

This induced an isolated error; it does not claim a spontaneous Worker crash was reproduced, nor qualify Stop, Save, downloads, exports, or general session recovery.

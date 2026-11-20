# #27 row 1427: early Flange guidance and flat-pattern warning

Verified product and browser driver: [`514181afa7258fe3c35ee5b035dd34a6a73a91ef`](https://github.com/barocss/cad/commit/514181afa7258fe3c35ee5b035dd34a6a73a91ef).
This is a synthetic reconstruction of the historical 55 × 20 mm obround plate, not its original file. Sheet thickness and base radius are 1.5 mm and K is 0.44.

- In Chrome/WebGPU Top/Ortho with edge selection, picking the curve at [55, 15, 1.5] mm resolves to native edge `n1.side1|n1.top`. Flange tells the user to select a straight edge without opening a draft.
- Picking the straight rim at [26, 25, 1.5] mm resolves to `n1.side2|n1.top`. With 20 mm length, 5 mm offsets and 1.5 × 1.5 mm rectangular relief, the preview warns that this result will not unfold while still allowing Apply. Cancel leaves the authored model untouched; reopening the tool starts from defaults.
- Apply makes a valid 2,158.524838 mm³ solid, without a flat pattern for the native `NON_NORMAL_CUT` reason. Undo restores the original document and native 55 × 20 mm flat data and lets the Flat dialog open again. A full-width rectangular control gives no false warning and has a one-bend flat.
- The original flat SVG draws the obround caps inward despite correct native flat data. This change does not modify the SVG or DXF renderer and is not a claim of curved-flat pixel accuracy.

The [reproduction driver](../../../test/flange-preview-advisory-browser.mjs) executed actual Chrome/WebGPU without downloads. All 1,113 frozen inputs matched before execution, after execution, after cleanup, and after carrying the source over an evidence-only parent update. Model tests 7/7, Model and Studio type-checks, scoped lint, and Vite production build passed. No manufacturing or general flattening acceptance is claimed.

Original, unedited 1440 × 1000 captures:

| Capture | SHA-256 |
| --- | --- |
| [Curved edge guidance](02-curved-launch-refused-without-draft.png) | `9b1be62a04285daa18cdff7df07ab3f42795159558a2732099d9979b0a09d5cf` |
| [Straight edge warning, Apply remains available](03-partial-preview-warning-apply-enabled.png) | `eb0c456dd2c9c8e9a6e4ace83c5b89be289785eaf37f5d476328bc19adc07496` |

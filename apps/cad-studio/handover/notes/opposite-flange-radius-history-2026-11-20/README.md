# #27 row 1711: opposite Flange radius History edit

Verified product and browser driver: [`d048fabd4e99f8d1f7fee44d15214d204473a9ef`](https://github.com/barocss/cad/commit/d048fabd4e99f8d1f7fee44d15214d204473a9ef).
This is independent of the original slotted-plate workflow in row 1427 and the earlier D121 connector-slot cut.

The synthetic rectangle is 80 × 50 mm, T1.5, K0.44, with two opposite 90° full-width Flanges. Each Flange initially owns its R2. Open terminal Flange `n3` from Flat pattern and attempt R19: preview refuses, and neither button Apply nor Enter changes the accepted model. Enter R3, wait for the geometry preview, and Apply. The earlier `n2` still owns R2, its bend geometry is unchanged, and `n3` owns R3. The first flat dimension remains 80 mm; the second measured native span changes from 84.35663645854885 to 83.92743278534375 mm, a decrease of `2 − π/2` mm.

The Chrome/WebGPU run repeated the native oracle after Undo/Redo and private project Save/Close/reload/Open. Saved and reopened authored documents matched structurally. No export or download. All 1,112 frozen inputs matched before and after execution and after cleanup; the temporary Chrome context, Chrome and the test server closed cleanly. Focused tests 12/12, Studio type-check, scoped lint and Vite production build passed. The [reproduction driver](../../../test/opposite-flange-radius-browser.mjs) is present in the product commit.

Original, unedited 1440 × 1000 screenshots:

| Capture | SHA-256 |
| --- | --- |
| [Before (n2 R2, n3 R2)](01-both-r2.png) | `5705277e9de79075e4a7f93b68453a27b9d95376453f0855d37ac994afb46fab` |
| [After (n2 R2, n3 R3)](05-terminal-r3.png) | `0664ceba6e1ef7b3c4ced2521bc635d9a8e91cf88de8d00008f3ad33354da4f5` |

This is limited to the qualified own-radius, terminal edit after one opposite Flange. It does not cover editing the earlier bend in a chain, additional or adjacent flanges, partial-width flanges, cut descendants, bend tables, or manufacturing.

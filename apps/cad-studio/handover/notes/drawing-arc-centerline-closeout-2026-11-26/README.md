# D2019 — Drawing Annotation Reference Signature Admission & #242 Closeout

Date: 2026-11-26  
Track: P2 Drawings (`#242` closeout, also hardening shared readers for `#243`, `#271`, `#224`, `#219`)  

## Fix Summary

- **`packages/barocss-cad-model/src/drawing/types.ts`:**
  - Added `sigOk` and `copySig` validating `Sig` strictly (`k` non-empty string, finite 3D `p`, optional finite 3D `d`, finite `s`, optional finite `r` and `n`).
  - Hardened `edgeRefOk`, `copyEdgeRef`, `dimPointOk`, and `copyDimPoint` so malformed `sig` or short `near` vectors never throw `TypeError: sig.p is not iterable`.
- **`packages/barocss-cad-model/src/drawing/savedAnnotationRefs.ts` & `src/engine/savedDrawing.ts`:**
  - Added `checkSavedAnnotationRefs(raw)` wired into `assertSavedDrawingDocument` covering all five annotation collections (`arcCenterlines`, `centerMarkGroups`, `bisectorCenterlines`, `virtualSharps`, `ordinateGroups`).
  - Malformed `sig` (e.g. `sig: {}`, short `sig.p`/`sig.d`, non-finite values) or short `near` vectors fail `.bcad` Open with an explicit `DRAWING_OPTIONS` message while leaving the currently open document completely unchanged.

## Verification

- **Model tests (`drawing-annotation-sig-admission` + all 5 annotation suites):** `19/19` PASS.
  - Verifies normal unsigned and signed refs pass, while empty/short/non-finite `sig` and short `near` across all 5 collections throw explicit `DRAWING_OPTIONS` (never `is not iterable`) and never throw in direct `readDrawing`.
- **Typecheck & build:** Model `tsc --noEmit`, Studio `tsc --noEmit`, `pnpm build`: PASS.
- **Real Chrome E2E (`D2019_SOURCE_FROZEN=1 node test/drawing-arc-centerline-closeout-browser.mjs`):** PASS.
  - Opened valid Shell 4 mm + `ac1` (R12) `.bcad`, rejected malformed `sig: {}` copy (Shell 2 mm / scale 2 canary) with explicit `DRAWING_OPTIONS` signature toast (no `is not iterable`), verified subsequent Save kept Shell 4 mm + scale 1 + `ac1`, and verified multi-sheet Sheet 1 / Sheet 2 ownership across Save and fresh Open.

## Captured Scenes

- [01-valid-arc-centerline.png](01-valid-arc-centerline.png) — Valid Shell 4 mm drawing with `ac1` (R12) rendered on Top view.
- [02-rejected-malformed-sig-toast.png](02-rejected-malformed-sig-toast.png) — Malformed `sig: {}` `.bcad` rejected with explicit `DRAWING_OPTIONS` error while preserving open document.
- [03-multisheet-sheet2-ac1.png](03-multisheet-sheet2-ac1.png) — Multi-sheet drawing showing `ac1` following Top view cleanly onto Sheet 2 (`Top sheet`).

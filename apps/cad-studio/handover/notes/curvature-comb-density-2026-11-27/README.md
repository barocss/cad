# D2076 — Set curvature comb density independently from scale

P5 [row 24](../../roadmap-rows/24.md) · [#762](https://github.com/barocss/cad/issues/762) · Base `f995bda91bb39178d40dba4102d652019e2f0ffe`.

**Comb density** shows 2, 4, or 8 spokes per native knot span, with 8 as the initial setting. The viewport picks a subset of the existing samples for spokes. The tip line still uses every original sample and clips each adjacent pair independently. Scale only changes each spoke's projected length. The setting belongs to the current inspected curve or edge and stays outside the project document.

## Verification

- **PASS, actual desktop Chrome WebGPU.** At both 1024 × 800 and 1440 × 900, the original R4 semicircle shows 4, 8, and 16 spokes at `0.25 mm⁻¹`. The two-span rational Direct arch also shows 4, 8, and 16, with an unchanged range of `0.0224231 – 0.8964867 mm⁻¹`. The single-span G2 control shows 2, 4, and 8, with `0.09090197 – 0.9918771 mm⁻¹` throughout.
- **PASS, separate scale and zoom.** Scale 4 to 8 doubles the visible spoke lengths at a fixed density and keeps the starts fixed. At the tightest tested orthographic zoom, the G2 edge has 6 and 7 visible strokes at full density on the two desktop widths, and 2 at the low setting on both. The lower setting uses a subset of those clipped strokes. Tip polylines match exactly. The product still measures all 8 native stations in that span.
- **PASS, document and scope.** The straight controls produce no comb. Changing the selection or opening the next document clears the old result. Every tested density change preserves the document and both Undo/Redo controls. The two desktop drivers retain 1,102 and 1,261 frozen source hashes through cleanup with zero page and console errors.
- **PASS, Studio checks.** The clipping and comb-run checks pass 15/15. Scoped ESLint, Studio type check, both driver syntax checks, diff check and the Studio production build pass.
- **FAIL, initial type check.** An existing comb test fixture still used the previous overlay shape. The final fixture supplies the density and tests the separate tip runs.
- **NOT_RUN.** The full local suites and mobile. Curve sampling, native continuity, and surface comb capabilities retain their previous scope. First mechanical CAD remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
pnpm --dir apps/cad-studio test curvature-comb-segments curvature-comb-runs
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
D1378_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/curvature-readout-browser.mjs "$OUT/desktop"
D1380_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/curvature-zoom-visibility-browser.mjs "$OUT/clipping"
```

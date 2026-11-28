# D2274 — Draw the principal section of a STEP cavity

P2 [row 11](../../roadmap-rows/11.md) and [row 13](../../roadmap-rows/13.md) · [#16](https://github.com/barocss/cad/issues/16) · Tested source `8c6a2ac489e1a536c5ba5dabe35adb3fe1a4cac5`.

- **Decision.** Qualify the two unchanged D2272 Studio-generated STEP files in the existing Drawing section and SVG workflow. Both pass. This milestone changes documentation only.
- **PASS, actual desktop.** Headed Chrome opened each original STEP file and created Section A–A through Y = 0 using the Drawing controls. The width 4 and 6 mm cases each show two exterior contours and two rectangular cavity contours. A native section read verifies exterior areas of 18 and 24 mm² per side, and cavity areas of 2 mm² per side. The independent trapezoid-minus-rectangle calculation gives net section areas of 32 and 44 mm². The imported Model volumes also agree with D2272.
- **PASS, exported SVG.** Parsed the XML from the actual SVG export Blob. Both exports contain all 16 cut sides at three fixed witnesses per side. The hatch switch changes only seven line elements for width 4 and six for width 6 within the section group. At 101 samples per changed line, all samples are inside the analytic material boundary and outside both cavity interiors, with a 0.001 mm readback allowance. Undo and Redo restore the hatch setting. Restoring hatch produces the original SVG bytes for both widths. The width 6 browser project Save, Close, reload and fresh Open retain the Drawing setting and identical SVG bytes.
- **PASS, environment and source guards.** Node 22.19.0 with the existing gate and desktop Chrome. The test used a frozen source capsule of 1,311 files. No page or console errors, tracked source writes or downloads. Export bytes were captured before browser download.
- **FAIL.** No failure observed in the selected workflow.
- **NOT_RUN.** PDF, DXF, external readers, mobile, other planes and other exchange profiles. Kernel/type/build were not rerun for this documentation-only change. The wider #16 acceptance remains open.

```sh
bash "$OUT/desktop.sh" desktop-first
git diff --check
```

# D2077 — Attach a straight Rib to the original top or bottom face

P1 [row 07](../../roadmap-rows/07.md) and [row 08](../../roadmap-rows/08.md) · [#755](https://github.com/barocss/cad/issues/755) · Base `db6eff88faeae5cb979f4a4f9106a03360e20f7a`.

Select one original horizontal cap of an upright rectangular stock extrusion. **Create > Rib** shows its face ID and outward direction. The command takes the X length, Y width, protrusion and XY centre in millimetres. The rib footprint must fit on that cap. This command uses 1 mm of engagement and keeps the preview in view when starting from Top or Bottom.

The Rib recipe stores the original face name and plane signature in the existing `sigs` field. Rebuild checks the original native face, rectangular trim, orientation and support. It applies the change in the cap's Z coordinate to the authored rib bounds before running the existing native Rib. History shows the original cap and authored dimensions. An unsigned coordinate Rib keeps its existing behavior and file format.

## Verification

- **PASS, baseline reproduction.** In actual desktop Studio at the base commit, the existing coordinate Rib stops at `Z=15` when the parent grows from 10 to 12 mm. The top-rib body then measures 14,520 mm³. The bottom control stays at `Z=-5` and measures 14,600 mm³. Save and fresh Open preserve both baseline outcomes.
- **PASS, actual Studio desktop Chrome WebGPU.** At 1440 × 1000, both actual cap picks preview a 20 × 2 × 5 mm Rib. The view shows the selected side. Cancel preserves the recipe and Undo/Redo state. A selected vertical face, zero protrusion and a footprint outside the cap all refuse. Explicit Apply adds one feature. Undo restores the stock and Redo restores the attachment. After editing `H` from 10 to 12, fresh `.bcad` Open restores the original cap, dimensions and native result in both files. The run retained 1,263 frozen source hashes through cleanup and reported zero page or console errors.
- **PASS, native geometry.** Each result passes strict B-rep validation as one closed solid. The independent oracle adds `20 × 2 × 5 = 200 mm³` to `40 × 30 × H` and computes the combined centroid from those two volumes. Native volume, Z range and centroid agree within the test tolerances and agree after fresh Open.

| Attachment | Stock H (mm) | Total volume (mm³) | Z range (mm) | Z centroid (mm) |
| --- | ---: | ---: | --- | ---: |
| Top | 10 | 12,200 | 0 to 15 | 5.122950820 |
| Bottom | 10 | 12,200 | −5 to 10 | 4.877049180 |
| Top | 12 | 14,600 | 0 to 17 | 6.116438356 |
| Bottom | 12 | 14,600 | −5 to 12 | 5.883561644 |

- **PASS, focused checks.** Eleven Model regressions cover the attached path and the existing coordinate Rib, including malformed or missing source anchors, unsupported current footprints and named thickness parameters. Scoped ESLint, Model and Studio type checks, browser-driver syntax, diff check and Studio production build pass.
- **FAIL, early Studio checks.** The rail marks unavailable commands with an explanation and shows a notice when clicked. Initial driver assertions expected a disabled button or tooltip. The off-cap explanation also required opening Kernel detail. Visual review then found that the initial below-face camera turned above the stock and hid the rib. The final run checks the signed view and both actual preview shapes.
- **NOT_RUN.** Full local suites, mobile, other stock geometries, multiple ribs and manufacturing. First mechanical CAD acceptance remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop execution and feature checks.
ATTACHED_RIB_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/attached-rib-browser.mjs "$OUT/final"
pnpm --dir packages/barocss-cad-model test attached-rib api-rib
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-final-dist"
```

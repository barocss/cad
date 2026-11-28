# D2147 — Set decimal places on one Drawing dimension

P2 [row 11](../../roadmap-rows/11.md) and [row 13](../../roadmap-rows/13.md) · [#765](https://github.com/barocss/cad/issues/765) · Base `561a4736961ce427af073b57d7ad8399522326d3`.

Select one ordinary manual linear or angle dimension in Drawing. Set Decimal places to 0 through 6, or choose Sheet default. The optional saved value changes the label and the space it occupies. The dimension ID, original references, placement and exact measurement persist. Tolerances, feature control frames, basic dimensions, dual units and fractional inch keep their own formatting. The saved choice becomes active again when the ordinary display returns.

## Verification

- **PASS, actual desktop baseline and candidate.** The baseline has two 12.3456 mm widths that both display 12.35 and one ordinary angle that displays 29.55°. It has no local decimal control. Desktop Studio changes only the first width to 12.346 and the angle to 29.5534°. The independent angle is `atan2(7, 12.3456)` in degrees, or 29.553393989643073°. The second width remains 12.35. Clearing the first override leaves the angle as set. Undo, Redo, native Save and fresh Open preserve the chosen display and exact stored references.
- **PASS, actual export bytes.** Reopened Studio generates SVG, PDF and AC1015 DXF from the same drawing, with 12.346, 12.35 and 29.5534°. The test reads the actual output blobs before delivery. The two DXF group 42 measurements both remain 12.3456 and all three native dimension definitions retain their existing geometry. The SVG and PDF contain the same printed numbers. Baseline and candidate freeze 1,292 and 1,294 files with zero source changes, page errors and console errors.
- **PASS, affected checks.** 74 Model checks and 23 Studio checks pass, including ordinary inch display, dual/fractional inch fallbacks, tolerance and frame formatting, malformed authoring data and native re-open. Both type checks, scoped ESLint, driver syntax, diff check and production Studio build pass on Node 22.19.0.
- **FAIL, existing local goldens.** Two SVG/DXF goldens in `drawing-standard` and `drawing-units-golden` fail in the current local environment. An archived base runs them with the same installed dependencies. All 38 changed hashes match the candidate's reported differences exactly. No golden was changed. The first browser attempt timed out when the test compared raw fixture property order against the normalized document. The rerun uses the normalized fixture and passes.
- **NOT_RUN.** Third-party DXF redraw, external PDF reference comparison, mobile and full local suites. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
DIMENSION_PRECISION_FROZEN=1 node apps/cad-studio/test/drawing-dimension-precision-browser.mjs "$OUT/final"
pnpm --dir packages/barocss-cad-model test drawing-units drawing-fractional-inch drawing-tolerance-printable drawing-standard drawing-linear-arrows drawing-reflex-angle
pnpm --dir apps/cad-studio test drawing-units drawing-tolerance drawing-dimension drawing-export
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

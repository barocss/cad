# D1826 — End round-section SVG hatch lines on the drawn circles

P2, rows 11 and 13. [Issue #743](https://github.com/barocss/cad/issues/743). Base `727d7488e634905e4657f8485c44608b27b8280d`.

For one full principal section of a solid with one circular cut face, check the entire native outer loop and the optional concentric inner loop. Bind each native edge to the visible arc used for the section outline. Check rational coefficients, edge names, oriented coedge and vertex closure, one complete turn per ring, and projected arc coverage. Use optional transient circle data only when the whole profile passes. Map its center and radii through the same sheet placement as the outline. Intersect the existing hatch rows with those circles and apply the existing SVG text clearance after computing the centerlines. Other sections and PDF/DXF still use their previous sampled representation.

- **FAIL — reproduced on the base.** Desktop Studio exports four exact semicircle paths and 24 hatch segments for an R20/R10 tube at 1:1. Sixteen hatch centerlines enter the bore, by up to 0.011954280240804138 mm. The outer hatch endpoints fall short by up to 0.024030059093504974 mm. The document is unchanged.
- **PASS — actual Studio and standalone SVG.** Compare every downloaded hatch interval with an independent line-circle calculation. The restored R20/R10 section has zero bore intrusions above 0.00011 mm and a maximum radial endpoint error of 5.2687569404241685e-05 mm. The largest signed intrusion after rounding is 3.982178041361806e-05 mm. The solid circle and the translated annulus at 2:1 pass the 0.00011 mm SVG endpoint bound with 16 and 48 segments. The latter's maximum radial endpoint error is 6.316825884766786e-05 mm. Hide and restore the hatch in Studio. Open and check each generated SVG in a separate browser page. Noncircular rectangle hatching remains visible. Six candidate Studio checkpoints and six standalone SVG reads have no browser errors or source changes.
- **PASS — focused checks.** 121 of 122 Model tests pass, including four new cases and the affected section, Detail, text clearance and exchange controls. The four new cases pass again after the final test-only lint fix. All five Studio tests, both package type checks, changed-path lint, production build and driver syntax pass. Focused comparisons strip the optional circle metadata and find identical PDF and DXF bytes. Tangent rows skip zero-length segments.
- **FAIL — inherited DXF fixture.** The plate drawing assertion on `plate-drawing/document.json` fails identically on the pinned base sources. No fixture rewrite is included. The first browser drafts exposed file-property ordering and an SVG DOM method difference. Both were corrected in the external harness before obtaining the baseline and measuring the final candidate.
- **NOT_RUN.** Full local suites, actual PDF/DXF rendering, mobile and alternate rendering backends. This delivery covers the issued full circular cut profile. General NURBS, other section forms and manufacturing certification remain outside this scope. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the heavy gate and external output. To reproduce the original error with the same analytic checker, run the browser driver with `--baseline` on the base producer. The fixture prepares a tube through the existing CAD command and uses public Studio Open and Export SVG.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-round-section-hatch drawing-section-hatch sections drawing-section-forms drawing-section-kinds drawing-breaks drawing-detail section-hatch-text-clearance section-text-clearance-scope dxf
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-section-revision drawing-worker section-annotation
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1826_SOURCE_FROZEN=1 node apps/cad-studio/test/round-section-svg-hatch-browser.mjs "$OUT/studio"
git diff --check
```

# D1884 — Rebuild both Fit limits across adjacent nominal ranges

P2 [row 11](../../roadmap-rows/11.md) and [row 13](../../roadmap-rows/13.md), [#269](https://github.com/barocss/cad/issues/269). Base `e409284104ec6747677436b2913bdde8cfd07d7c`. This adds a desktop regression for existing behavior.

- **PASS, desktop, native geometry and independent exports.** The Parameters panel drives a bore and shaft through the same parameter. At Ø12 and exactly Ø14 the original H7/g6 rows 1/2 apply. At Ø14.5 both change to rows 3/4. Hole provenance changes from `range-a` to `range-b` and the shaft remains estimated. The two actual cylindrical B-rep radii agree within `1e-8 mm`. Stable dimension ID, source edge, class and pair bindings survive. The curve signature follows the physical seam. Undo returns to Ø14, Redo restores Ø14.5, and Save and fresh Open retain the same drawing. Eight desktop states and four SVG/DXF pairs pass.
- **PASS, independent precision.** Standard-library XML and DXF TEXT readers check original download bytes for nominal, rows, source, estimate, dual callout and cell locations. At Ø14.5 the physical H7 interval is [14.501, 14.503] mm and g6 is [14.496, 14.497] mm. The inch nominal is `.57087`, the displayed H7 changes are `+.00011/+.00004` and the g6 changes are `-.00013/-.00016`. Decimal reconstruction requires both output intervals to have positive width and lie within the physical limits after conversion by 25.4. Fresh Open gives the same readback.
- **PASS, scoped checks.** 48 Model tests, 3 Studio tests and focused lint.
- **FAIL, earlier harnesses.** The first used an outdated development summary shape. The second compared the saved seam signature to its pre-edit point. The final run checks the exact live seam position as well as stable authored identity.
- **FAIL, inherited adjacent check.** The extended Model run reported 48 PASS and one frozen ordinary-units golden mismatch for ISO/ASME SVG/DXF hashes. The test and all product exporters are unchanged. The four affected actual SVG/DXF pairs passed.
- **NOT_RUN.** Local production build for this test-only change, mobile, external viewers and broader drawing-scope acceptance. The first mechanical CAD baseline remains 8/10. Whole product completion remains unmeasured.

## Issue acceptance

The [initial implementation](https://github.com/barocss/cad/issues/269#issuecomment-6975715858) verifies deliberate add, move, remove, saving and exports. The [previous nominal and unit lifecycle](https://github.com/barocss/cad/actions/runs/44284758506) verifies the missing-row diagnostic. [D1874](https://github.com/barocss/cad/issues/269#issuecomment-7123288373) verifies pair/estimate, class/table/dimension edits and stable source identity. [D1875](https://github.com/barocss/cad/issues/269#issuecomment-7123370285) verifies delayed replies across document replacement. [D1883](https://github.com/barocss/cad/issues/269#issuecomment-7125073824) verifies empty versus unavailable lists and retaining other tables, with Model coverage for section/detail, ambiguity and duplicate dimensions. D1884 completes the adjacent active range and narrow printed-zone portion of the original single-base-part, single-sheet, ordinary-view contract. Closure requires exact successful CI and confirmed attached desktop scenes.

## Reproduce

Use Node 22.19.0, local desktop Chrome and Playwright, and Python's standard library. Freeze the checkout during Studio and run heavy jobs serially.

```sh
pnpm --dir packages/barocss-cad-model test drawing-fit-list fit-drawing drawing-tolerance-printable drawing-units.test
pnpm --dir apps/cad-studio test fit-list-settings
D1884_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-fit-paired-boundary-browser.mjs "$OUT/studio"
```

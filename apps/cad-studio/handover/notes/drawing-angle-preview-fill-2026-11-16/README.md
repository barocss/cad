# Drawing angular preview fill (#113)

The committed sheet SVG establishes `fill="none"` on its marks group. The independent preview marks group did not, so its SVG arc inherited the default black fill. The preview CSS now establishes `fill: none`; only intentional `fill="#000"` arrowhead paths and text receive the preview color. Explicit non-filled paths are no longer recolored by a generic `[fill]` selector.

No dimension calculation, geometry, selection, saved data or export code changed.

Actual desktop Chrome evidence:
- Baseline reproduced the 45-degree arc fill as `rgb(0, 0, 0)` and failed the no-fill assertion.
- Fixed triangle Top view: 45 and 135 degrees at widths 1440 and 1024 (height 900), four cases PASS.
- Each preview arc has computed fill `none`; arrowheads remain filled and text remains colored.
- Each applied dimension has the same degree value and exact arc path as its preview, and no fill.
- Source-frozen checks and runtime/console checks PASS. Screenshots reviewed for 1440/45 and 1024/135.
- Studio drawing regression tests: 22/22 PASS. Driver lint PASS. Studio TypeScript and production build PASS (existing import/directive warnings).

Driver: `test/drawing-angle-preview-fill-browser.mjs` with `ANGLE_PREVIEW_FROZEN=1`, configured `PW_DIR`/`CHROME`, and output directory.

Limits: desktop Chrome only, current theme; alternate renderers/themes and PDF/SVG exports were not run. Whole workspace suite was not run. This qualifies the reported preview-fill issue, not general drawing readability or #613 overlaps.

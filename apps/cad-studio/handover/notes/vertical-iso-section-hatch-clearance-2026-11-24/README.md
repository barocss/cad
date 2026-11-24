# D1918 — Qualify vertical ISO text clearance in a full section

P2 [row 11](../../roadmap-rows/11.md), [#247](https://github.com/barocss/cad/issues/247). Base `552670c9922664eaa9c6062896614edba9d4433f`.

Extend the existing Screen/SVG evidence to a vertical ISO-aligned linear dimension. Use the exact same ordinary full-section product path. The production code did not need a change.

- **PASS, desktop Studio and actual SVG.** One native 60 × 40 × 40 mm solid and full section A. The vertical nominal measures 40 mm at 1:1. The original text and the later authored +0.4/−0.2 mm deviation marks each have a 90° text angle. The exported SVG expresses that angle as a −90° rotation about each mark's baseline. The live and exported hatch segments match in all six marked SVG results.
- **PASS, independent clipping.** The oracle expands each half-plane using its edge length. It checks the final rotated conservative text bounds, a 0.6 mm paper gap and a 0.125 mm round cap. The inspected protected regions overlap material, and no exported segment enters the required clearance. The nominal uses 31 hatch segments. Three stacked text marks use 33 segments before the drag and 35 after it.
- **PASS, actual drag and native history.** The pointer moves the label. Only its stored placement changes. Undo restores the original 33-segment set. Redo and fresh native Open restore the same 35-segment set seen after the drag. The 40 mm witnesses and signed deviations survive. The horizontal placement and complete D1915 lifecycle controls also pass with the revised independent reader.
- **PASS, small checks.** Node driver syntax, scoped lint and Git diff check.
- **FAIL, initial lint.** The shared driver assigned an unused local binding while omitting the document from the SVG oracle input. The driver now removes that field directly. The oracle receives the same fields.
- **NOT_RUN.** Other dimensions or section forms, live PDF and DXF, mobile and paid providers. The existing PDF HOLD stays in force. First mechanical CAD remains 8/10. Overall completion is unmeasured. The existing bounded #247 closeout stands.

```sh
SECTION_HATCH_TEXT_CLEARANCE_FROZEN=1 node apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs "$OUT/studio" --iso-vertical
SECTION_HATCH_TEXT_CLEARANCE_FROZEN=1 node apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs "$OUT/placement-control"
SECTION_HATCH_TEXT_CLEARANCE_FROZEN=1 node apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs "$OUT/lifecycle-control" --lifecycle
node --check apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs
pnpm exec eslint apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs
git diff --check
```

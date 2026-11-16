# Broken view picks follow retained ink

Baseline `c18013e68ce4e0c14660cb34bd1002bc89a4523c`. Bounded #34 Broken empty-gap selection fix. The output writer already clips correctly; this change is confined to Studio dimension picking.

## Reproduction and fix

An actual 500 × 20 × 20 mm bar, holes at X250 and X450, drawing scale 1:2 and X break 100–400 reproduced a mismatch: Linear selected a hidden original snap in the empty gap, and Angle selected the full original straight edge through its near-endpoint fallback. Baseline browser run `/tmp/cad-broken-pick-baseline-02` confirms both pending references without document mutation.

Linear, Angle and Radius now reject strict band interiors and filter removed snap points; edge hits use the existing clipped projection. Angle's fallback shares the same guard. Original edge names, analytic circles and endpoint references are preserved: a retained piece still measures the original geometry, not a synthetic break endpoint. Boundaries remain eligible. Free dimension placement coordinates, Diameter's existing clipping path, Datum targets, output writers and model/schema are unchanged.

## Verification

- Focused tests cover gap interiors at large tolerance, boundaries/multiple X/Y bands, removed centre attraction, original 500 mm endpoints, no synthetic snaps, no-break identity, and retained analytic circle/radius identity: 5/5 PASS.
- Actual desktop Chrome fixed run `/tmp/cad-broken-pick-fixed-01`: gap refuses Linear/Angle; removed circle centre cannot start Linear; retained line creates original 500 mm dimension; first Undo/Redo; post-Redo gap refusal; retained edges create 90°; New part then in-memory .bcad Open retains dimensions and refuses the gap. No physical download.
- Final screenshot visually reviewed: retained views, break gap, 500 and 90° labels render. Existing placement issue warnings in this deliberately compact fixture are not asserted resolved.
- Browser source capsule and receipts retained locally; source was frozen throughout the actual run. Browser driver is committed for reproduction. Radius has focused analytic-reference coverage, not a separate browser creation claim.
- Helper/test lint passes. DrawingWorkspace lint has exactly the same five pre-existing unused-symbol errors as baseline (`DrawingFix`, `_sig`, `_was`, `_leader`, `_sheet`), with no new error.

First failures: initial baseline driver expected an entire edge to start Linear, but the actual hidden hole snap correctly exposed the stronger bug (second-point hint). The final baseline checks either original-point or edge-start behavior. Added circular fixture initially mutated readonly test properties; it was corrected to construct immutable fixture objects before final type-check.

## Limits and next work

This is not all of #34. Section hidden-wall diagnostics and section-missing-hole reasons remain separate. No native-folder/picker, physical export, mobile matrix, kernel precision/rounding (#35), schema migration or held features were touched. Existing #126 WIP remains protected. No golden files regenerated.

Final Studio type-check, helper/test lint and production build PASS (4.94 s; existing warnings retained). Diff-check PASS. Shared installed Model source is unchanged in this Studio-only batch. Original checkout still has the same eight WIP entries.

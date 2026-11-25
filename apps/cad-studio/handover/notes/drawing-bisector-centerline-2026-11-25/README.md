# D2012 — Source-bound straight centerline between two parallel straight edges (`#271`)

- **Date:** 2026-11-25
- **Issue:** [#271](https://github.com/barocss/cad/issues/271)
- **Track:** P2 Drawings
- **Parent:** `402235e654f24fac13df04df06bdde495e2d3e82`

## Summary

Added source-bound straight bisector centerlines (`DrawingBisectorCenterline`, `DrawingSettings.bisectorCenterlines`) connecting two distinct, visible, unclipped, same-body, same-depth, strictly parallel, equal-span straight edges in an ordinary unbroken orthographic view (`front`, `top`, `right`).

- **Model (`@barocss/cad-model`):**
  - Added `DrawingBisectorCenterline` and `DrawingSettings.bisectorCenterlines` with strict `readBisectorCenterlines` validation (unique non-empty `id`, principal orthographic `view`, distinct finite `EdgeRef`s) in [types.ts](../../../../packages/barocss-cad-model/src/drawing/types.ts).
  - Added [bisectorCenterline.ts](../../../../packages/barocss-cad-model/src/drawing/bisectorCenterline.ts) (`BISECTOR_EXTENSION_MM = 2.5`, `newBisectorCenterlineId`, `pickBisectorCenterlineEdge`, `resolveBisectorCenterline`) computing exact unextended native bisector geometry invariant to endpoint order, pick order, rotation, and translation, while rejecting same-edge, non-parallel, near-parallel, unequal-span, depth-offset, cross-body, hidden/clipped, circular, and broken/iso inputs.
  - Integrated into [sheet.ts](../../../../packages/barocss-cad-model/src/drawing/sheet.ts) (`MarkGroup.bisectorCenterline`, fixed 2.5 mm paper-space overshoot matching `centres.ts`, hidden when `settings.centers === false` while retaining the record), [sheets.ts](../../../../packages/barocss-cad-model/src/drawing/sheets.ts) (`forSheet`/`mergeSheet`), [reorient.ts](../../../../packages/barocss-cad-model/src/drawing/reorient.ts) (view remap with atomic `ORIENTATION_REMAP_FAILED` refusal if broken), [svg.ts](../../../../packages/barocss-cad-model/src/io/svg.ts) (`class="bisector-centerline"`, `data-bisector-centerline`), [issues.ts](../../../../packages/barocss-cad-model/src/drawing/issues.ts) (`BISECTOR_CENTERLINE_LOST` + `remove-bisector-centerline` fix, without suppressing `OVERALL_MISSING`), and [references.ts](../../../../packages/barocss-cad-model/src/engine/references.ts) (signature capture, verification, and isolated copy setters).
- **Studio (`apps/cad-studio`):**
  - Added the **Centerline** (`B`, `tune`) tool with live two-source highlight and bisector preview, **CENTERLINES** sidebar list, `Delete` removal, and DXF compatibility note in [DrawingWorkspace.tsx](../../../src/ui/DrawingWorkspace.tsx), [ExportActions.tsx](../../../src/ui/drawing/ExportActions.tsx), and [drawing.css](../../../src/drawing/drawing.css).

## Verification

- Unit tests: [drawing-bisector-centerline.test.ts](../../../../packages/barocss-cad-model/test/drawing-bisector-centerline.test.ts) + drawing/reference regression suite (`61/61` PASS) + Studio [drawing-commit-roundtrip.test.ts](../../../test/drawing-commit-roundtrip.test.ts) & [tolerance-input-units.test.ts](../../../test/tolerance-input-units.test.ts) (`8/8` PASS).
- Type-check, lint & build: `tsc --noEmit` (both packages), scoped `eslint`, and `pnpm build` clean.
- Real Chrome E2E (`D2012_SOURCE_FROZEN=1`): [drawing-bisector-centerline-browser.mjs](../../../test/drawing-bisector-centerline-browser.mjs) PASS (same-edge & perpendicular refusals, Escape cancel with unchanged Doc, live preview without Doc mutation, creation at `y=5` with 2-source highlight, `Centre lines` hide/show preserving record, Delete + Undo/Redo, SVG & DXF `CENTER` `LINE` exact `45 mm` (`40 + 2×2.5 mm`), native `.bcad` Save/Open, and post-Open Box `Depth: 10 → 14 mm` edit moving bisector cleanly to `y=7`).
- Prior-milestone Chrome regression (`D2011_SOURCE_FROZEN=1`): [drawing-center-mark-group-browser.mjs](../../../test/drawing-center-mark-group-browser.mjs) PASS.

## Screenshots

- `01-placed-y5.png`: Top view showing `cl1` bisecting the `40 × 10` plate at `y=5` with both parallel source edges highlighted and `CENTERLINES 1` (`L40 cl1 · top`).
- `02-centers-hidden.png`: Global `Centre lines` unchecked (centerline hidden while record and source highlights remain preserved).
- `03-reopened-saved.png`: Reopened saved `.bcad` rendering `cl1` with `2.5 mm` paper overshoot on both ends.
- `04-after-depth-14.png`: Post-Open Box `Depth: 10 → 14 mm` edit updating `cl1` cleanly to `y=7`.

## Boundaries

- Scoped to two distinct, visible, unclipped, same-body, same-depth, strictly parallel, equal-span straight edges in ordinary unbroken `front`/`top`/`right` base-part views; unequal lengths, partial overlaps, angle bisectors, silhouettes, curves, depth-offset edges, broken/section/detail/assembly/iso views are refused.
- DXF writes non-associative `LINE` entities on the `CENTER` layer with a Studio compatibility notice; PDF golden/ASME and schema 5/migration HOLDs remain separate.

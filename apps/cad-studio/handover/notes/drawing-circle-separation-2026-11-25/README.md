# D2009 — Min / Max circumference gap between two disjoint circles (`#238`)

- **Date:** 2026-11-25
- **Issue:** [#238](https://github.com/barocss/cad/issues/238)
- **Track:** P2 Drawings

## Summary

Added native disjoint circle separation drawing dimensions (`kind: 'circle-separation'`) supporting explicit `min` (nearest circumference gap `d - rA - rB`) and `max` (farthest circumference span `d + rA + rB`) modes.

- **Model (`@barocss/cad-model`):**
  - Added `CircleSeparationMode` (`'min' | 'max'`) and `CircleSeparationDimensionData` (`kind: 'circle-separation'`, nested `first`/`second` `EdgeRef`s, no top-level `edge`/`near`) with strict `readDrawing` validation in [types.ts](../../../../packages/barocss-cad-model/src/drawing/types.ts).
  - Added [circleSeparation.ts](../../../../packages/barocss-cad-model/src/drawing/circleSeparation.ts) verifying ordinary unbroken orthographic views (`front`, `top`, `right`), two distinct visible coplanar full circles (handling seam-split 180°+180° rims), strict 3D coplanarity, and strict external disjointness (`d > rA + rB + 1e-4`), rejecting concentric, tangent, overlapping, contained, partial-arc, non-coplanar, and non-round inputs.
  - Updated [savedReflexAngle.ts](../../../../packages/barocss-cad-model/src/drawing/savedReflexAngle.ts) so `circle-separation`'s `mode` field is never misvalidated as a reflex-angle option.
  - Integrated into [dimensions.ts](../../../../packages/barocss-cad-model/src/drawing/dimensions.ts), [sheet.ts](../../../../packages/barocss-cad-model/src/drawing/sheet.ts), [dimensionReferences.ts](../../../../packages/barocss-cad-model/src/drawing/dimensionReferences.ts), [annotations3d.ts](../../../../packages/barocss-cad-model/src/drawing/annotations3d.ts), [issues.ts](../../../../packages/barocss-cad-model/src/drawing/issues.ts), [dxf.ts](../../../../packages/barocss-cad-model/src/io/dxf.ts), [references.ts](../../../../packages/barocss-cad-model/src/engine/references.ts), and [features.ts](../../../../packages/barocss-cad-model/src/chat/features.ts).
- **Studio (`apps/cad-studio`):**
  - Added the **Circle gap** (`K`, `adjust`) tool with explicit `Min` / `Max` placement toggles in [DrawingWorkspace.tsx](../../../src/ui/DrawingWorkspace.tsx), `Gap mode` toggle (`Min` / `Max`) and `Reselect` recovery in [DimensionsList.tsx](../../../src/ui/drawing/DimensionsList.tsx), and DXF compatibility notice in [ExportActions.tsx](../../../src/ui/drawing/ExportActions.tsx).

## Verification

- Unit tests: [drawing-circle-separation.test.ts](../../../../packages/barocss-cad-model/test/drawing-circle-separation.test.ts) + targeted drawing/reference suite (`52/52` PASS) + [tolerance-input-units.test.ts](../../../test/tolerance-input-units.test.ts) (`4/4` PASS).
- Type-check & lint: `tsc --noEmit` and `eslint` clean on all touched files; `pnpm build` clean.
- Real Chrome E2E (`D2009_SOURCE_FROZEN=1`): [drawing-circle-separation-browser.mjs](../../../test/drawing-circle-separation-browser.mjs) PASS (same-circle refusal, Escape cancel, Min `20` & Max `40` placement, inch `.787` / `1.575`, drag without mode flip, Undo/Redo, SVG/DXF export with 0 fake `DIMENSION` entities, `.bcad` Save/Open, post-Open Hole 2 diameter `12 → 16 mm` edit → `18` / `42`).
- Prior-milestone Chrome regression (`D2008_SOURCE_FROZEN=1`): [drawing-cylinder-diameter-browser.mjs](../../../test/drawing-cylinder-diameter-browser.mjs) PASS.

## Screenshots

- `01-placed-min20-max40.png`: Top view showing both Min (`20`) and Max (`40`) circumference gaps on `C_A=(0,0) r=4`, `C_B=(30,0) r=6`.
- `02-inch-units.png`: Inch display (`.787` and `1.575`).
- `03-reopened-saved.png`: Reopened saved `.bcad` retaining both `min` and `max` dimensions.
- `04-after-hole-r8.png`: Post-Open Hole 2 edit `r=6 → 8 mm` updating live to `18` and `42`.

## Boundaries

- Scoped to ordinary unbroken `front`, `top`, and `right` base-part views with strictly externally disjoint coplanar full circles; concentric, tangent, overlapping, contained, partial-arc, depth-offset, and broken views are refused.
- DXF writes exact drawn lines, arrowheads, and text with a Studio compatibility note; PDF golden/ASME HOLD stays separate.

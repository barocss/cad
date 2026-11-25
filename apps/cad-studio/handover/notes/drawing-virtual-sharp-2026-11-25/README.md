# D2013 — Drawing virtual sharp and theoretical intersection linear dimensions (`#224`)

- **Date:** 2026-11-25
- **Issue:** [#224](https://github.com/barocss/cad/issues/224)
- **Track:** P2 Drawings
- **Parent:** `9878f646d3ab59d84ac479588f3d8f8300c6fa9a`

## Summary

Added source-bound drawing virtual sharps (`DrawingVirtualSharp`, `DrawingSettings.virtualSharps`) and associative `at: 'virtual-sharp'` linear dimension endpoints referencing the exact theoretical intersection of two distinct, visible, same-body, same-depth, non-parallel straight edges in ordinary unbroken orthographic views (`front`, `top`, `right`), without adding fake vertices to the 3D B-rep topology.

- **Model (`@barocss/cad-model`):**
  - Added `DrawingVirtualSharp`, `DrawingSettings.virtualSharps`, and `DimPoint.at = 'virtual-sharp'` (with nested `second: EdgeRef` and optional `virtualSharpId`) with strict `readDrawing` validation in [types.ts](../../../../packages/barocss-cad-model/src/drawing/types.ts).
  - Added [virtualSharp.ts](../../../../packages/barocss-cad-model/src/drawing/virtualSharp.ts) (`VIRTUAL_SHARP_OVERSHOOT_MM = 1.5`, `newVirtualSharpId`, `pickVirtualSharpEdge`, `resolveVirtualSharp`, `resolveVirtualSharpInProjection`) verifying ordinary orthographic views, same-body & same-depth coplanarity, non-parallelism (`sin(angle) >= 1e-3`), and strict separation from finite segments (rejecting shared vertices, parallel/near-parallel lines, depth-offset skew lines, silhouettes, and curves).
  - Integrated `virtual-sharp` resolution and identity across [dimensions.ts](../../../../packages/barocss-cad-model/src/drawing/dimensions.ts), [sheet.ts](../../../../packages/barocss-cad-model/src/drawing/sheet.ts) (`MarkGroup.virtualSharp` thin witness extension lines + broken-view refusal), [sheets.ts](../../../../packages/barocss-cad-model/src/drawing/sheets.ts) (`forSheet`/`mergeSheet`), [reorient.ts](../../../../packages/barocss-cad-model/src/drawing/reorient.ts), [svg.ts](../../../../packages/barocss-cad-model/src/io/svg.ts) (`class="virtual-sharp"`, `data-virtual-sharp`), [issues.ts](../../../../packages/barocss-cad-model/src/drawing/issues.ts) (`VIRTUAL_SHARP_LOST` + `remove-virtual-sharp` + `rematched`/`accepted`), [measurement.ts](../../../../packages/barocss-cad-model/src/drawing/measurement.ts), [auto.ts](../../../../packages/barocss-cad-model/src/drawing/auto.ts), [toleranceStack.ts](../../../../packages/barocss-cad-model/src/drawing/toleranceStack.ts), [references.ts](../../../../packages/barocss-cad-model/src/engine/references.ts), and [features.ts](../../../../packages/barocss-cad-model/src/chat/features.ts).
- **Studio (`apps/cad-studio`):**
  - Added the **Virtual sharp** (`X`, `add`) tool with live two-source highlight and witness preview, automatic snap-point integration for **Linear dimension** (`D`), **VIRTUAL SHARPS** sidebar list, `Delete` removal, snapshot validation in [drawingDimensionChanges.ts](../../../src/storage/drawingDimensionChanges.ts), and DXF compatibility note in [DrawingWorkspace.tsx](../../../src/ui/DrawingWorkspace.tsx), [ExportActions.tsx](../../../src/ui/drawing/ExportActions.tsx), and [drawing.css](../../../src/drawing/drawing.css).

## Verification

- Unit tests: [drawing-virtual-sharp.test.ts](../../../../packages/barocss-cad-model/test/drawing-virtual-sharp.test.ts) + drawing/reference regression suite (`64/64` PASS) + Studio [drawing-commit-roundtrip.test.ts](../../../test/drawing-commit-roundtrip.test.ts) & [tolerance-input-units.test.ts](../../../test/tolerance-input-units.test.ts) (`8/8` PASS).
- Type-check, lint & build: `tsc --noEmit` (both packages), scoped `eslint`, and `pnpm build` clean.
- Real Chrome E2E (`D2013_SOURCE_FROZEN=1`): [drawing-virtual-sharp-browser.mjs](../../../test/drawing-virtual-sharp-browser.mjs) PASS (`30 × 20 × 10` plate with 4 mm corner chamfer: parallel & already-meeting refusals, Escape cancel with unchanged Doc, live preview, `vs1` at `(30, 20)`, horizontal `30` & vertical `20` linear dimensions snapped to `vs1`, Undo/Redo, SVG & DXF export, `.bcad` Save/Open, post-Open Chamfer `4 → 6 mm` preserving `(30, 20)` and `30`/`20`, and post-Open Box Width `30 → 40 mm` updating `(40, 20)` and horizontal `30 → 40`).
- Prior-milestone Chrome regression (`D2012_SOURCE_FROZEN=1`): [drawing-bisector-centerline-browser.mjs](../../../test/drawing-bisector-centerline-browser.mjs) PASS.

## Screenshots

- `01-placed-30-20.png`: Top view with `vs1` witness extensions at `(30, 20)` and linear dimensions `30` and `20`.
- `02-reopened-saved.png`: Reopened saved `.bcad` retaining `vs1` and both dimensions (`30`, `20`).
- `03-after-chamfer-6.png`: Post-Open Chamfer edit (`4 → 6 mm`) extending witness lines while keeping virtual corner `(30, 20)` and dimensions `30` & `20`.
- `04-after-width-40.png`: Post-Open Box Width edit (`30 → 40 mm`) updating `vs1` to `(40, 20)` and horizontal dimension `30 → 40`.

## Boundaries

- Scoped to two distinct, visible, same-body, same-depth, non-parallel straight edges whose intersection lies strictly outside both finite segments in ordinary unbroken `front`/`top`/`right` base-part views; parallel/near-parallel, shared-vertex, depth-offset, cross-body, curve/silhouette, broken/section/detail/assembly/iso inputs are refused.
- Does not modify 3D B-rep topology or add sketch virtual-sharp entities; DXF writes witness lines on `THIN` alongside native `DIMENSION` entities; PDF golden/ASME and schema 5/migration HOLDs remain separate.

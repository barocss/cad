# D2011 — Hole row center mark group with toggleable connecting line (`#243`)

- **Date:** 2026-11-25
- **Issue:** [#243](https://github.com/barocss/cad/issues/243)
- **Track:** P2 Drawings
- **Parent:** `67ea90766616bba6b389213890220827ec00f4d3`

## Summary

Added source-bound linear hole-row center mark groups (`DrawingCenterMarkGroup`, `kind: 'linear'`) preserving explicit circular-hole member references (`3..32` collinear, coplanar, equal-radius full circular rims) with a per-group toggleable connecting line (`connectingLines: boolean`).

- **Model (`@barocss/cad-model`):**
  - Added `DrawingCenterMarkGroup` and `DrawingSettings.centerMarkGroups` with strict `readCenterMarkGroups` validation (unique non-empty `id`, `kind === 'linear'`, principal orthographic `view`, boolean `connectingLines`, `3..32` finite non-duplicate `CentreRef` members) in [types.ts](../../../../packages/barocss-cad-model/src/drawing/types.ts).
  - Added [centerMarkGroup.ts](../../../../packages/barocss-cad-model/src/drawing/centerMarkGroup.ts) (`newCenterMarkGroupId`, `pickCenterMarkGroupCircle`, `validateCenterMarkGroupCandidate`, `resolveCenterMarkGroup`) enforcing ordinary unbroken `front`/`top`/`right` views, fully visible unclipped circular rims (including seam-split full turns), strict 3D coplanarity, equal positive radius, distinct centers, strict 3D collinearity, and order-independent sorted adjacent center-to-center segments without duplicating automatic `centreMarks` crosses or auto-enrolling newly added holes.
  - Integrated into [sheet.ts](../../../../packages/barocss-cad-model/src/drawing/sheet.ts) (`MarkGroup.centerMarkGroup`, `Sheet.centerMarkGroups`, center-pen `line` segments hidden when `connectingLines === false` or `settings.centers === false` while keeping records), [sheets.ts](../../../../packages/barocss-cad-model/src/drawing/sheets.ts) (`forSheet`/`mergeSheet` view ownership), [reorient.ts](../../../../packages/barocss-cad-model/src/drawing/reorient.ts) (view remap with atomic refusal if broken), [svg.ts](../../../../packages/barocss-cad-model/src/io/svg.ts) (`class="center-mark-group"` + `data-center-mark-group`), [issues.ts](../../../../packages/barocss-cad-model/src/drawing/issues.ts) (`CENTER_MARK_GROUP_LOST` + `remove-center-mark-group` fix, without suppressing `HOLE_SIZE_MISSING`/`HOLE_NOT_LOCATED`), and [references.ts](../../../../packages/barocss-cad-model/src/engine/references.ts) (signature capture, verification, and isolated copy setters).
- **Studio (`apps/cad-studio`):**
  - Added the **Hole row** (`H`, `polyline` / `Waypoints`) tool with incremental refusal, live 3-hole source highlight & connecting-line preview, explicit **Create row** / **Cancel** controls, `HOLE ROWS` sidebar list with per-group **Line** toggle & **Remove** action, `Delete` key support, and DXF compatibility note in [DrawingWorkspace.tsx](../../../src/ui/DrawingWorkspace.tsx), [ExportActions.tsx](../../../src/ui/drawing/ExportActions.tsx), and [drawing.css](../../../src/drawing/drawing.css).

## Verification

- Unit tests: [drawing-center-mark-group.test.ts](../../../../packages/barocss-cad-model/test/drawing-center-mark-group.test.ts) + drawing/reference regression suite (`78/78` PASS) + Studio [drawing-commit-roundtrip.test.ts](../../../test/drawing-commit-roundtrip.test.ts) & [tolerance-input-units.test.ts](../../../test/tolerance-input-units.test.ts) (`8/8` PASS).
- Type-check, lint & build: `tsc --noEmit` (both packages), scoped `eslint`, and `pnpm build` clean.
- Real Chrome E2E (`D2011_SOURCE_FROZEN=1`): [drawing-center-mark-group-browser.mjs](../../../test/drawing-center-mark-group-browser.mjs) PASS (straight/duplicate/off-axis refusals, Escape cancel with unchanged Doc, explicit Create row commit, 3-source highlight, per-group `Connecting line` toggle & global `Centre lines` toggle preserving record, Delete + Undo/Redo, SVG `<g class="center-mark-group" data-center-mark-group="cmg1">` & DXF `CENTER` `LINE` export of exact 20 mm segments, native `.bcad` Save/Open, and post-Open Hole 3 `Centre X` edit `40 → 50 mm` updating connecting segments to `20 + 30 mm`).
- Prior-milestone Chrome regression (`D2010_SOURCE_FROZEN=1`): [drawing-arc-centerline-browser.mjs](../../../test/drawing-arc-centerline-browser.mjs) PASS.

## Screenshots

- `01-placed-3holes.png`: Top view showing `cmg1` created on 3 collinear `R=3` holes (`0, 20, 40`) with all 3 sources highlighted and `HOLE ROWS 1` panel (`Line` active).
- `02-line-hidden.png`: Per-group `Connecting line` toggled off (connecting line hidden while group record and 3 highlighted sources stay intact).
- `03-reopened-saved.png`: Reopened saved `.bcad` retaining `cmg1` and its chain-dashed connecting lines.
- `04-after-hole3-x50.png`: Post-Open Hole 3 edit (`Centre X: 40 → 50 mm`) updating connecting segments live (`20 + 30 mm`) without enrolling the off-axis hole.

## Boundaries

- Scoped to ordinary unbroken `front`, `top`, and `right` base-part views with 3–32 distinct, visible, unclipped, coplanar, equal-radius collinear full circular holes; non-collinear, depth-offset, unequal-radius, partial-arc, clipped, hidden, broken, section, detail, assembly, and isometric views are refused.
- Member list is strictly authored (newly added model holes are never auto-enrolled; deleted/suppressed members keep the group record unresolved with `CENTER_MARK_GROUP_LOST` and emit no connecting lines).
- DXF writes non-associative `LINE` entities on the `CENTER` layer with a Studio compatibility notice; PDF golden/ASME HOLD and schema 5/migration HOLD stay separate.

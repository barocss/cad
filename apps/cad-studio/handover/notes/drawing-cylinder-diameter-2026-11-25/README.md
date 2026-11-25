# D2008 — Cylinder side silhouette diameter drawing dimension (`#236`)

- **Date:** 2026-11-25
- **Issue:** [#236](https://github.com/barocss/cad/issues/236)
- **Track:** P2 Drawings

## Summary

Added native cylinder side silhouette diameter drawing dimensions (`kind: 'cylinder-diameter'`) backed by exact analytic cylinder provenance on projected silhouettes in `@barocss/cad`.

- **Kernel (`@barocss/cad`):**
  - Added `ProjectedCylinderSource` (`{ face, axis, origin, radius }`) and optional `cylinder?: ProjectedCylinderSource` on `ProjectedEdge` in [brep-hidden-line.ts](../../../../packages/barocss-cad/src/brep/brep-hidden-line.ts) (exported from [index.ts](../../../../packages/barocss-cad/src/index.ts)).
  - Populated `cylinder` strictly from `faceGeometry` on both smooth-joint cylinder silhouettes and face-interior cylinder silhouette chains. Boxes, cones, and other non-cylindrical surfaces leave `cylinder` unset.
- **Model (`@barocss/cad-model`):**
  - Added `CylinderFaceRef` and `CylinderDiameterDimensionData` (`kind: 'cylinder-diameter'`, nested `cylinder: CylinderFaceRef`, no top-level `edge`/`near`) in [types.ts](../../../../packages/barocss-cad-model/src/drawing/types.ts).
  - Added [cylinderDiameter.ts](../../../../packages/barocss-cad-model/src/drawing/cylinderDiameter.ts) verifying ordinary unbroken orthographic views (`front`, `top`, `right`), visible straight silhouettes with native cylinder provenance, and cylinder axis parallel to the view plane (`|dot(axis, toward)| <= 1e-4`), measuring exact `2 * r` independent of `~sil0`/`~sil1` chain ordering and label placement.
  - Integrated into [dimensions.ts](../../../../packages/barocss-cad-model/src/drawing/dimensions.ts), [sheet.ts](../../../../packages/barocss-cad-model/src/drawing/sheet.ts), [dimensionReferences.ts](../../../../packages/barocss-cad-model/src/drawing/dimensionReferences.ts), [annotations3d.ts](../../../../packages/barocss-cad-model/src/drawing/annotations3d.ts), [issues.ts](../../../../packages/barocss-cad-model/src/drawing/issues.ts), [dxf.ts](../../../../packages/barocss-cad-model/src/io/dxf.ts), [references.ts](../../../../packages/barocss-cad-model/src/engine/references.ts) (`edge: false`, `nativeFace: true`, `cylinderFace: true`), and [features.ts](../../../../packages/barocss-cad-model/src/chat/features.ts).
- **Studio (`apps/cad-studio`):**
  - Added the **Side diameter** (`Y`, `swap_horiz`) tool in [DrawingWorkspace.tsx](../../../src/ui/DrawingWorkspace.tsx), `Reselect` recovery in [DimensionsList.tsx](../../../src/ui/drawing/DimensionsList.tsx), and DXF compatibility notice in [ExportActions.tsx](../../../src/ui/drawing/ExportActions.tsx).

## Verification

- Kernel smoke: `pnpm --filter @barocss/cad test:api-smoke` (`22/22` PASS).
- Unit tests: [drawing-cylinder-diameter.test.ts](../../../../packages/barocss-cad-model/test/drawing-cylinder-diameter.test.ts) + targeted drawing/reference suite (`49/49` PASS) + [tolerance-input-units.test.ts](../../../test/tolerance-input-units.test.ts) (`4/4` PASS).
- Type-check & lint: `tsc --noEmit` and `eslint` clean on all touched files; `pnpm build` clean.
- Real Chrome E2E (`D2008_SOURCE_FROZEN=1`): [drawing-cylinder-diameter-browser.mjs](../../../test/drawing-cylinder-diameter-browser.mjs) PASS (top-view non-silhouette refusal, Escape cancel, front-view placement `Ø12`, inch `Ø.472`, drag across sides, Undo/Redo, SVG/DXF export with 0 fake `DIMENSION` entities, `.bcad` Save/Open, post-Open Cylinder `Diameter: 14` edit → `Ø14`).
- Prior-milestone Chrome regression (`D2007_SOURCE_FROZEN=1`): [drawing-radial-thickness-browser.mjs](../../../test/drawing-radial-thickness-browser.mjs) PASS.

## Screenshots

- `01-placed-d12.png`: Front view side-silhouette diameter `Ø12` placed on `r=6, L=30 mm` cylinder.
- `02-inch-472.png`: Inch unit conversion (`Ø.472`).
- `03-reopened-saved.png`: Reopened saved `.bcad` retaining `Ø12` without spurious rematch.
- `04-after-radius-7.png`: Post-Open `Cylinder` diameter edit `12 → 14 mm` updating live to `Ø14`.

## Boundaries

- Ordinary unbroken `front`, `top`, and `right` views on base-part drawings only; broken, section, detail, isometric, oblique, end-on, hidden-only, cone, and planar edges are explicitly refused.
- DXF exports exact drawn lines, arrowheads, and text with a Studio compatibility note rather than a fake DXF `DIMENSION` entity; PDF golden/ASME mismatch HOLD stays separate.

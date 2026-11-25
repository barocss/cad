# D2017 — Drawing Center of Mass Symbol & Live Linear Dimensions (#250)

Date: 2026-11-26  
Track: P2 Drawings (`#250`)  
Scope: Source-bound center-of-mass (CG) symbols (`DrawingCenterOfMass`, `DrawingSettings.centerOfMass`) and live COM linear-dimension endpoints (`DimPoint.at = 'com'`) on ordinary unbroken orthographic views (`front`, `top`, `right`) of made solid part bodies.

## Contract & Truth Rules

- **Explicit body ownership:** Every `DrawingCenterOfMass` and `DimPoint` (`at: 'com'`) names an explicit `bodyKey` (no fake edge name — `edge: ''` — and never silently falls back to `bodies[0]` or sums multiple bodies).
- **Live qualified mass provider (`packages/barocss-cad-model/src/drawing/centerOfMass.ts`):**
  - `qualifiedCenterOfMassSources(doc, bodies, scope)` admits only `scope.kind === 'part'` made solid bodies with `massRef === undefined` (never pending), non-empty `massMethod` (missing method is never treated as exact), finite `volume > 0`, and finite 3D `centroid`.
  - Excludes assembly scope, `bought === true`, `role === 'infill'`, `kind === 'mesh'`, and suppressed nodes.
  - Does **not** require the centroid to lie inside solid material (hollow frames / U-shaped parts with COM in empty air resolve accurately).
  - Single uniform body centroid is invariant under material density changes, sheet scale, units (`mm`/`inch`/dual), and symbol diameter (`2..12 mm`, default `4 mm`).
- **Presentation vs. measurement separation:** Hiding a CG symbol (`hidden: true`) removes its symbol ink from the sheet/SVG/DXF while dependent linear dimensions continue resolving live from `bodyMassSources`.
- **Strict unresolved reporting:** Missing/excluded/pending/broken/iso/assembly targets report `CENTER_OF_MASS_LOST` (with `remove-center-of-mass` fix) and `DIMENSION_LOST`, never fabricating `(0, 0, 0)` or reusing stale `near`.
- **Reference/persistence integration:** `engine/references.ts` skips `at === 'com'` from fake edge signatures/rematching; `readDrawing`, `forSheet`/`mergeSheet`, `reorient`, `svg.ts` (`data-center-of-mass`), `dxf.ts` (THIN circle/crosshair/quadrant fills + native DXF linear `DIMENSION`), and `drawingDimensionChanges.ts` all preserve the contract within existing schema 3 (no schema 5/migration).

## Verification

- **Model unit tests (`packages/barocss-cad-model/test/drawing-center-of-mass.test.ts` + 8 regression suites):** PASS (0 failures)
  - Analytic `40×20×10` box `(20, 10, 5)`, asymmetric `40×20×10` plate with `10×10` through-cut at `x=25..35, y=5..15` (`X = 130/7 ≈ 18.57142857 mm`, distinct from bbox `20 mm`), shifted cut `x=20..30` (`135/7 ≈ 19.28571429 mm`), widened plate `50×20×10` (`220/9 ≈ 24.44444444 mm`), hollow frame with COM in empty air, material density invariance, hidden symbol keeping dependent dimensions live, scale/unit/diameter invariance, pending/missing-method/NaN/bought/assembly/broken/iso/unknown-body refusals, multi-body explicit binding, `captureSignatures`/`verifyReferences`, multi-sheet `forSheet`/`mergeSheet`, `reorient`, SVG, and AC1015/R12 DXF verification.
- **Typecheck & lint & build:** Model `tsc --noEmit`, Studio `tsc --noEmit`, scoped `eslint`, `pnpm build`: PASS.
- **Real Chrome E2E (`D2017_SOURCE_FROZEN=1 node test/drawing-center-of-mass-browser.mjs`):** PASS.
  - Placed `com1` on asymmetric `40×20×10` plate in Top view (`(18.57, 10)`), snapped linear dimensions `18.57` and `10` to `com1`, verified Hide/Show keeps `18.57` and `10` intact, Undo/Redo, SVG & DXF export, `.bcad` Save/Open, and post-Open Box `Width: 40 → 50` updating COM live to `(24.44, 10)` and linear dim `18.57 → 24.44`.
- **Chrome regression (`D2013_SOURCE_FROZEN=1 node test/drawing-virtual-sharp-browser.mjs`):** PASS.

## Captured Scenes

- [01-com-and-dims-18-57.png](01-com-and-dims-18-57.png) — Asymmetric plate CG symbol (`com1`) and live linear dimensions `18.57` and `10`.
- [02-com-hidden-dims-kept.png](02-com-hidden-dims-kept.png) — CG symbol hidden while dependent `18.57` and `10` dimensions remain resolved.
- [03-reopened-width-50-com-24-44.png](03-reopened-width-50-com-24-44.png) — Fresh `.bcad` Open followed by Box `Width: 40 → 50` updating COM and horizontal dimension live to `24.44`.

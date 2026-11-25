# D2020 — Sketch Revolve Profile Axis-Based Diameter Dimension (`#259`)

- **Date:** 2026-11-26
- **Issue:** [#259](https://github.com/barocss/cad/issues/259)
- **Track / Priority:** P1 Sketch & Constraints

## Summary

Adds driving axis-based diameter dimension `AxisDiameterRule` (`kind: 'adia'`, key `adiay<point>` / `adiax<point>`) for revolve half-profiles on closed sketch outlines:

1. **Model (`packages/barocss-cad-model/src/sketch/axisDiameter.ts`, `terms.ts`, `rules.ts`, `outlineFields.ts`, `driven.ts`, `entityIds.ts`, `corner.ts`, `mobility.ts`, `conflict.ts`):**
   - Constrains a selected outline point to signed radial coordinate `side * (D / 2)` from the explicit sketch revolution axis (`axis: 'y'` locks `x = side * D / 2` about `x = 0`; `axis: 'x'` locks `y = side * D / 2` about `y = 0`), storing authored diameter `D` (`value`) while keeping the along-axis coordinate free (`rank + 1`, `rows + 1`).
   - Exact signed linear constraint in `ruleTerms` (one fixed helper point `ap<k>` + one vertical/horizontal segment `as<k>`) prevents branch flips across the revolution axis and preserves sub-display decimal precision (e.g. `D = 12.0006` solves to exact radius `6.0003` mm).
   - Post-solve `axisDiameterProblem` check in `checkedEdit` and exact rectilinear conflict proof in `rectilinearConflict` reject invalid (`NaN`, `±Infinity`, `<= 0`, `< 0.002`), on-axis (`|coord| <= 1e-6`), redundant, and conflicting constraints without corrupting accepted geometry or rank/DOF.
   - Retains `adia` rules on Rectangle-drawn half-profiles (`rectangleNode` keeps `outline`), carries point indices through `carryPolygon` / `replaceCorner`, supports `outlineMobility`, `driven-sketch` validation, and Feature Editor (`outlineFields`) numeric edits.
2. **Studio UI (`apps/cad-studio/src/ui/ConstraintTools.tsx`, `SketchMarks.tsx`):**
   - Selecting one off-axis outline point surfaces `Ø About Y` and/or `Ø About X` actions in `ConstraintTools` (only offering axes the point lies off).
   - `SketchMarks` renders a full revolve diameter dimension across the revolution axis (dashed mirror extension and half-line on the revolved side, solid half-line to the profile point, dual outward arrowheads, and centered `Ø<D>` inline-editable chip).

## Verification

- **Typecheck:** `pnpm --filter @barocss/cad-model exec tsc --noEmit` & `pnpm --dir apps/cad-studio exec tsc --noEmit` — PASS.
- **Model unit & regression tests:** `pnpm --filter @barocss/cad-model test -- sketch-axis-diameter sketch-edge-circle-gap sketch-reference-dimensions sketch-rectangle-driving-retention sketch-outline-field-identity sketch-reopen driven-sketch-contract` — PASS.
  - `Y-axis diameter Ø12 -> Ø14 updates half-profile radius and native Revolve volume` (`720π` → `980π` mm³, `outlineMobility` 1-DOF vertical motion, constraint removal restores DOF `1 → 2`).
  - `rectangle-drawn half-profile retains adia through .bcad save/open and Feature Editor Ø14 -> Ø16 edit` (`1280π` mm³).
  - `negative-side Y-axis profile stays on negative branch (-6 -> -7) and X-axis profile scales Y (6 -> 7)`.
  - `tilted 3D sketch plane and fractional diameter 12.0006 preserve exact radius 6.0003`.
  - `refuses non-positive/tiny/non-finite values, on-axis points, redundant and conflicting constraints without corrupting state`.
- **Workspace build:** `pnpm build` — PASS.
- **Real Chrome E2E (`D2020_SOURCE_FROZEN=1`):** `apps/cad-studio/test/sketch-axis-diameter-browser.mjs` — PASS, plus `D2016_SOURCE_FROZEN=1` (`sketch-reference-dimensions-browser.mjs`) regression — PASS.
  - Opens half-profile `[(0,0),(6,0),(6,20),(0,20)]` + 360° Revolve (`R = 6`, `V = 720π`), verifies zero-diameter refusal, adds `Ø12`, edits inline `Ø12 → Ø14`, verifies Sketch & Document Undo/Redo, finishes to exact `R = 7` / `Bounds 14 × 20 × 14` / `V = 980π`, saves `.bcad` & reopens cleanly, and edits `Ø14 → Ø16` via Feature Editor to exact `R = 8` / `Bounds 16 × 20 × 16` / `V = 1280π`.

## Screenshots

- `01-axis-diameter-12-added.png`: Driving `Ø12` Y-axis diameter added on point 2 (`1 DOF left`, `About Y` action, dashed mirror + solid diameter span).
- `02-axis-diameter-14-edited.png`: Inline edit `Ø12 → Ø14` moves `x1, x2` to `7 mm` while keeping axis points at `x = 0` and height `20 mm`.
- `03-finished-revolve-14.png`: Finished 360° Revolve solid (`Bounds 14 × 20 × 14`, `Mass 8.3 g`, exact `980π` mm³).
- `05-reopened-feature-edit-16.png`: Fresh `.bcad` reopen + Feature Editor edit `Ø14 → Ø16` (`Bounds 16 × 20 × 16`, `Mass 10.9 g`, exact `1280π` mm³).

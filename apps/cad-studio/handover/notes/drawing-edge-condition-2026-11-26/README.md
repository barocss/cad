# D2024 — Drawing Edge-Condition Symbols (#212)

- **Date:** 2026-11-26
- **Issue:** [#212](https://github.com/barocss/cad/issues/212)
- **Track:** P2 Drawings

## Scope Delivered
- **Structured Model & Validation (`packages/barocss-cad-model/src/drawing/edgeCondition.ts`, `types.ts`, `sheets.ts`, `reorient.ts`, `savedAnnotationRefs.ts`, `engine/references.ts`):**
  - Adds `DrawingEdgeCondition` (`id`, `view`, `edge`, `sign`, `upperMm`, `lowerMm`, `direction`, `allAround`, `place`) stored on `DrawingSettings.edgeConditions` (schema 3/4 compatible).
  - Supports structured signs (`+`, `-`, `±`, `unspecified`) and directions (`any`, `horizontal`, `vertical`), validating `upperMm > 0`, `lowerMm > 0`, `lowerMm <= upperMm`, and refusing numeric sizes on `unspecified`.
  - Uses conservative 4-decimal truncation when formatting inch sizes (`0.5 mm → 0.0196 in`) so display rounding never relaxes declared material allowances.
  - Strict visible, non-ambiguous edge qualification (`pickEdgeConditionEdge` / `resolveEdgeCondition`) on unbroken orthographic views; emits explicit `EDGE_CONDITION_LOST` / `EDGE_CONDITION_AMBIGUOUS` issues with `remove-edge-condition` fixes rather than silently reattaching to another edge.
  - Raw `.bcad` admission rejects malformed `edge` (`sig`/`near`), invalid sign/direction, non-positive or swapped limits, and non-finite `place` with explicit `DRAWING_OPTIONS`.
  - Remaps view-scoped `edgeConditions` across `forSheet`/`mergeSheet`, `reorient`, and `engine/references.ts` reference rematching.
- **Scale-Invariant Vector Rendering, Exports & Studio UX (`sheet.ts`, `issues.ts`, `io/svg.ts`, `DrawingWorkspace.tsx`, `ExportActions.tsx`):**
  - Renders scale-invariant paper-mm vector right-angle corner glyph (`3.2 mm`), leader arrowhead, optional all-around elbow circle, direction tick, and sign/stacked upper & lower limits (`<g class="edge-condition" data-edge-condition="…">`) in Studio SVG and AC1015/R12 DXF export.
  - Adds `Edge condition` tool (`P`) in `DrawingWorkspace.tsx` with hover/click/preview/drag placement, `EDGE CONDITIONS` sidebar card with draft controls, inline `Move`, `Flip sign`, and `Remove` actions, explicit non-certification disclaimer, and `DXF edge condition compatibility` note in `ExportActions.tsx`.

## Verification
- **Typecheck & Build:** `tsc --noEmit` (Model & Studio) + `pnpm build`: PASS.
- **Model Unit & Regression Tests (`16/16` PASS):**
  - `drawing-edge-condition.test.ts` (3/3): validation refusals, conservative inch truncation (`0.5 mm → 0.0196 in`), asymmetric 60×35×10 plate with two distinct edges, scale-invariant `3.2 mm` paper-mm glyph at `1:1` and `1:2`, SVG & AC1015/R12 DXF readback, `EDGE_CONDITION_LOST` + `applyFix`, raw saved admission rejection, and `.bcad` Save/Open round-trip.
  - Regressions: `drawing-inspection-items` (4/4), `drawing-revision-markers` (4/4), `drawing-hole-table` (3/3), `drawing-annotation-sig-admission` (2/2).
- **Real Chrome E2E (`D2024_SOURCE_FROZEN=1` + `D2023_SOURCE_FROZEN=1` regression):**
  - `apps/cad-studio/test/drawing-edge-condition-browser.mjs`: PASS
  - `apps/cad-studio/test/drawing-inspection-items-browser.mjs`: PASS

## Visual Captures
1. `01-edge-conditions-placed.png` — Asymmetric 60×35×10 plate with `ec1` (`−0.5 / −0.1` horizontal all-around) on Top view upper edge and `ec2` (`+0.3` vertical) on Top view left edge.
2. `02-edited-and-moved.png` — After moving `ec2` and flipping its sign (`+0.3 → −0.3`) with live sidebar & canvas sync.
3. `03-reopened-verified.png` — Fresh `.bcad` reopen preserving both symbols, parameters, and invariant part geometry (`55.9 g`, `60 × 35 × 10`).

## Boundaries
- Scoped to unbroken orthographic views of base parts; explicitly labeled as drawing annotation only (not ISO 13715 / ASME compliance certification).
- DXF exports edge-condition symbols as non-associative lines, circles, and text; PDF golden and schema 5/migration HOLDs remain unchanged.

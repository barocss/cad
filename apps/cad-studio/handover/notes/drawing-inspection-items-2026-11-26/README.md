# D2023 — Drawing Inspection Items, Baseline Diff, Table & CSV (#225)

- **Date:** 2026-11-26
- **Issue:** [#225](https://github.com/barocss/cad/issues/225)
- **Track:** P2 Drawings

## Scope Delivered
- **Stable Inspection Identity & Target Binding (`packages/barocss-cad-model/src/drawing/inspectionItems.ts`, `types.ts`, `sheets.ts`, `sheet.ts`):**
  - Adds `DrawingInspectionItem` (`id`, `number`, `dim`, `targetKey`, optional sheet-mm `offset`) and `DrawingInspectionBaseline` (`revision`, `entries`) stored on `DrawingSettings` (schema 3/4 compatible).
  - Separates stable internal identity (`ii1`, `ii2`, …), user-visible unique integer balloon number (`1..9999`), and target dimension identity (`dim` + structural `targetKey` fingerprint).
  - First scope supports non-basic `linear` and `diameter` dimensions (refuses `basic` / reference dimensions; attaches ONE inspection item per dual dimension rather than duplicating for secondary units).
  - Detects target deletion (`INSPECTION_ITEM_LOST`), basic conversion, and dimension ID reuse / Auto-dimension replacement (`INSPECTION_ITEM_STALE`) with explicit `remove-inspection-item` fixes — never silently relinking or hiding unresolved items.
  - Multi-sheet `forSheet` / `mergeSheet` keeps badge rendering per sheet while resolving all sheets' inspection items for Sheet 1's `INSPECTION LIST` table (`from: 'inspection'`) and CSV export.
- **Baseline Revision Tracking & Number Reuse Warnings:**
  - Explicit `Record inspection baseline` captures non-destructive per-revision snapshots (`inspectionBaselines`) that are never overwritten by later revisions.
  - `nextInspectionNumber` skips all retired baseline numbers so removed numbers are never automatically recycled.
  - `diffInspectionBaseline` classifies baseline entries as `unchanged` / `changed` / `removed` / `reassigned`, and explicit user reuse of a retired number on a different requirement emits a non-blocking `INSPECTION_NUMBER_REUSED` warning.
- **Distinct Visuals, Studio UX & Bounded Exports (`io/svg.ts`, `DrawingWorkspace.tsx`, `ExportActions.tsx`, `issues.ts`, `savedAnnotationRefs.ts`):**
  - Renders rounded stadium/pill inspection badges (`<g class="inspection-item" data-inspection-item="…">`), visibly distinct from circular BOM item balloons, with paper drag and cross-highlighting of both badge and linked dimension.
  - Exports bounded `Inspection CSV` (`inspectionListCsv`) with spreadsheet-formula protection (`purchaseCell`), preserving native `nominal_mm` and signed mm limits separately from display text/units, leaving `lower_mm`/`upper_mm` empty for `fit` codes (e.g. `H7`), and never fabricating measured actuals or PASS/FAIL verdicts.
  - Raw `.bcad` admission rejects duplicate IDs, duplicate/out-of-range numbers, and non-finite offsets with explicit `DRAWING_OPTIONS`.

## Verification
- **Typecheck & Build:** `tsc --noEmit` (Model & Studio) + `pnpm build`: PASS.
- **Model Unit & Regression Tests (`26/26` PASS):**
  - `drawing-inspection-items.test.ts` (4/4): 2-sheet 3-dimension bracket, renumbering, sheet move, SVG/DXF readback, basic refusal, target deletion lost, ID-reuse stale detection, saved admission, Baseline A → B diff (`unchanged`/`changed`/`removed`/`reassigned`), retired number protection, reuse warning, inch/dual precision separation, fit-code limit honesty, formula-safe CSV readback, and `.bcad` round-trip.
  - Regressions: `drawing-revision-markers` (4/4), `drawing-metadata` (13/13), `drawing-hole-table` (3/3), `drawing-annotation-sig-admission` (2/2).
- **Real Chrome E2E (`D2023_SOURCE_FROZEN=1` + `D2022_SOURCE_FROZEN=1` regression):**
  - `apps/cad-studio/test/drawing-inspection-items-browser.mjs`: PASS
  - `apps/cad-studio/test/drawing-revision-markers-browser.mjs`: PASS

## Visual Captures
1. `01-inspection-items-multisheet.png` — Sheet 1 with stadium/pill badges `1` (`25.4 ±0.1`) and `2` (`Ø8 THRU H7`), Sheet 2 item `3` (`ii3`), and live 3-row `INSPECTION LIST` table.
2. `02-renumbered-baseline-diff.png` — After Baseline Rev A and renumbering `ii2` (`2 → 7`), showing cross-highlighted `Ø8 THRU H7` + pill `7`, updated `INSPECTION LIST`, and `Baseline Rev A: #1 unchanged · #2 changed · #3 unchanged`.
3. `03-reopened-verified.png` — Fresh `.bcad` reopen preserving all 3 items, baseline diff, table, and invariant part geometry (`40.2 g`, `50.8 × 25.4 × 12`).

## Boundaries
- First scope targets non-basic linear and diameter dimensions (GD&T frames, notes, weld symbols, CMM/FAI/AS9102 certification, and measured pass/fail columns remain out of scope).
- DXF exports badges as non-associative lines, arcs, and text; PDF golden and schema 5/migration HOLDs remain unchanged.

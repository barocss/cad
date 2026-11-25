# D2003 — Optional crossing break/gap on intersecting linear drawing dimension lines (#237)

Date: 2026-11-25 · Track: P2 Drawings · Issue: [#237](https://github.com/barocss/cad/issues/237)

## Decision

Add optional `crossingBreak?: LinearCrossingBreak` on manual orthographic (`front`/`top`/`right`) base-part `linear` drawing dimensions (`over`, sheet-mm `gap` in `[1, 10]` defaulting to `2`, and verified `target` identity `{ id, orient, aEdge, bEdge }` — never cut coordinates or mark array indices).

- **Execution order & D416 preservation:** `applyLinearCrossingBreaks()` runs in `buildSheet()` strictly **after** `placeShortLinearText()`, preserving D416 short-label fallback, ASME unidirectional text gaps, and broken views.
- **Exact sheet-mm geometry & clearance:** Splits only a single strict interior proper crossing between two straight `role: 'dimension'` lines in the same unbroken orthographic view. Rejects parallel/collinear segments, endpoint touches, multiple crossings, crossings too close to arrowheads/segment ends/text/basic frames, NaN/out-of-range gaps, target deletion, ID reuse with different edge/orient identity, Auto-dimension replacement, and mutual conflicts (`CROSSING_BREAK_CONFLICT` / `CROSSING_BREAK_INACTIVE` warnings). Leaving the crossing removes any gap immediately (no ghost hole).
- **Consumer separation:**
  - **Studio & SVG (`io/svg.ts`):** Consumes the exact two split `<line>` marks inside the host `<g class="dimension" data-dim="...">` while leaving the target line, both values, arrowheads, extensions, and references identical. Centerline removal length `gap` (`2.0 mm` / `3.0 mm`) stays invariant in sheet mm across scale and mm/inch/dual changes; visible clearance after `0.25 mm` thin stroke is `gap - 0.25 mm`.
  - **DXF (`io/dxf.ts`):** Preserves exact native `DIMENSION` geometry (`p1`, `p2`, `line`, `angle`) and `measurement`, while storing the split lines in the dimension's display block with an explicit Studio compatibility note (`DXF crossing break compatibility`).
  - **3D PMI (`drawing/annotations3d.ts`):** Reconstructs the unbroken `origin` segment once from transient `CrossingBreakSplitInfo`, so 2D paper crossing breaks never cut spurious holes in 3D model-space annotations.

## Changes

- `packages/barocss-cad-model/src/drawing/crossingBreak.ts` (new): strict interior segment crossing, clearance guards, `applyLinearCrossingBreaks()`, and `eligibleCrossingBreaks()`.
- `packages/barocss-cad-model/src/drawing/types.ts`: `LinearCrossingBreak`, `LinearCrossingBreakTarget`, `readLinearCrossingBreak()`, `crossingBreakGapOk()`, and `readDrawing()` validation.
- `packages/barocss-cad-model/src/drawing/sheet.ts`: `CrossingBreakSplitInfo`, `Sheet.crossingBreaks`, post-D416 crossing-break pass.
- `packages/barocss-cad-model/src/drawing/annotations3d.ts`: unbroken 3D PMI line reconstruction.
- `packages/barocss-cad-model/src/drawing/issues.ts`: `CROSSING_BREAK_CONFLICT` and `CROSSING_BREAK_INACTIVE` warnings.
- `apps/cad-studio/src/ui/drawing/DimensionsList.tsx`, `apps/cad-studio/src/ui/DrawingWorkspace.tsx`, `apps/cad-studio/src/ui/drawing/ExportActions.tsx`: `Crossing break` target/gap/Clear controls, mutual-conflict refusal without Doc/history mutation, atomic single-Undo commit, and DXF compatibility note.
- `packages/barocss-cad-model/test/drawing-crossing-break.test.ts` (new) & `apps/cad-studio/test/drawing-crossing-break-browser.mjs` (new).

## Verification

- `@barocss/cad-model` tests (`drawing-crossing-break`, `drawing-linear-arrows`, `drawing-breaks`, `drawing-foreshortened-radius`, `drawing-fractional-inch`): **27/27 PASS**.
- `@barocss/cad-model` `type-check`, `@barocss/cad-studio-app` `type-check`, scoped ESLint across all 9 touched files, `pnpm build`: **PASS**.
- Actual Chrome Studio E2E (`D2003_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-crossing-break-browser.mjs`): **PASS** (unbroken baseline → `2 mm` break → mutual conflict refusal on `v1` leaving Doc/history unchanged → FIRST Undo/Redo → `3 mm` gap + `inch` + `1:2` scale invariance → independent exported SVG & DXF verification → native `.bcad` Save + fresh Open → `Clear` restoration).
- D1999 Chrome regression (`D1999_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-linear-arrows-browser.mjs`): **PASS**.

## Captured Studio scenes

- [00-unbroken.png](00-unbroken.png) — Baseline unbroken crossing linear dimensions `40` (`h1`) and `24` (`v1`) at `1:1` mm.
- [01-break-2mm.png](01-break-2mm.png) — Crossing break applied on `h1` over `v1` with exact `2 mm` paper gap (`1.75 mm` clear gap after `0.25 mm` stroke); `v1` stays continuous.
- [02-gap-3mm-inch-scaled.png](02-gap-3mm-inch-scaled.png) — `3 mm` paper gap preserved at `1:2` scale in `inch` units (`1.575` / `.945`).
- [03-fresh-open.png](03-fresh-open.png) — Native `.bcad` Save and fresh Studio Open restores identical `3 mm` break and target metadata.
- [04-cleared.png](04-cleared.png) — Clearing the crossing break restores the unbroken line and removes the DXF compatibility note.

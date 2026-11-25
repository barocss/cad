# D2021 — Source-Bound Drawing Hole Table (`#232`)

- **Date:** 2026-11-26
- **Issue:** [#232](https://github.com/barocss/cad/issues/232)
- **Track / Priority:** P2 Drawings

## Summary

Adds source-bound `DrawingHoleTable` (`DrawingSettings.holeTables`) linking explicit datum origin, authored plain-through hole feature identity, user-editable hole tags, view tag bubbles, and a live-updating hole coordinate/size table:

1. **Model (`packages/barocss-cad-model/src/drawing/holeTable.ts`, `types.ts`, `savedAnnotationRefs.ts`, `sheets.ts`, `reorient.ts`, `sheet.ts`, `issues.ts`, `engine/references.ts`, `io/svg.ts`):**
   - `DrawingHoleTable` stores `id`, `view` (`front | top | right`), explicit `origin: DimPoint`, `members: DrawingHoleTableMember[]` (`1..3` in bounded v1 profile, each with stable row `id`, user `tag`, explicit authored `owner` feature ID `/^n\d+$/`, and `rim: EdgeRef`), and optional paper placement `at` / `corner`.
   - `qualifyHoleTableRim` enforces visible full-circle rims (including 180°+180° seam-split rims) on explicit authored plain-through `HoleNode`s, explicitly refusing bosses, fillets, extrusions, blind/threaded/countersunk/counterbored/patterned holes, foreign bodies, broken views, and assembly drawings without positional fallback.
   - `resolveHoleTable` computes exact signed coordinates in the live orthographic projection frame (`X = dot(C - O, pr.right)`, `Y = dot(C - O, pr.up)` in model mm, invariant to scale, view/table placement, zoom, and paper Y-down) and formats values with `lengthFormats(preset)` (true mm ↔ inch conversion + dual units).
   - Separates `HOLE_TABLE_ORIGIN_LOST` from per-row `HOLE_TABLE_MEMBER_LOST` (keeping unresolved rows marked `UNRESOLVED` rather than silently dropping them or displaying stale values), never silences `HOLE_NOT_LOCATED`, validates saved `sig`/`near` payloads upfront in `checkSavedAnnotationRefs`, preserves single-sheet ownership (`sheets.ts`), remaps views in `reorient.ts`, exports `data-hole-table` groups in SVG and `TEXT`/`LINE`/`ARC` entities in AC1015 & R12 DXF, and auto-places tables in clear sheet space via `roomIn`.
2. **Studio UI (`apps/cad-studio/src/ui/DrawingWorkspace.tsx`, `useDrawingSheet.ts`, `ExportActions.tsx`):**
   - Adds `Hole table` toolbar tool (`J`, `Grid2x2` icon) with origin pick → 1–3 plain through-hole rim picks → `Create hole table (N)` / `Cancel` (`Esc` cancels without mutating `Doc`).
   - Adds `HOLE TABLES` sidebar card supporting inline tag rename, row reorder (`↑`/`↓`) without tag reassignment, table `Move`, and `Remove`, plus DXF compatibility notice in `ExportActions`.

## Verification

- **Typecheck:** `pnpm --filter @barocss/cad-model exec tsc --noEmit` & `pnpm --dir apps/cad-studio exec tsc --noEmit` — PASS.
- **Model unit & regression tests (`24/24` PASS):** `pnpm --filter @barocss/cad-model test -- drawing-hole-table drawing-independent-locations drawing-parameter-hole-callout drawing-ordinate drawing-annotation-sig-admission`.
  - Exact `#232` fixture (`40×40×8` plate, origin hole `O=(10,10)`, `C1=(20,15) Ø4`, `C2=(5,15) Ø4`, `C3=(20,30) Ø6`) verifies `(10, 5)`, `(-5, 5)`, `(10, 20)` mm, origin hole exclusion, SVG & AC1015/R12 DXF export, and non-suppression of `HOLE_NOT_LOCATED`.
  - Verifies scale `1:2` / `A3` / row reorder / true inch conversion (`10 mm → .394`, `20 mm → .787`), targeted edit of `n4` updating only `A2`, `.bcad` Save/Open round-trip, refusals for boss/blind/patterned/`>3` members/malformed `sig`, and suppressed hole `HOLE_TABLE_MEMBER_LOST` + `applyFix`.
- **Workspace build:** `pnpm build` — PASS.
- **Real Chrome E2E (`D2021_SOURCE_FROZEN=1` + `D2018_SOURCE_FROZEN=1` regression):** `apps/cad-studio/test/drawing-hole-table-browser.mjs` — PASS.
  - Verifies Escape cancel, origin + 3 rim picks, exact `(10,5)`, `(-5,5)`, `(10,20)`, tag rename `A3 → B1`, row reorder, table Move, Undo/Redo, SVG & DXF downloads, `.bcad` Save → fresh Open, and post-Open Hole `n4` edit (`Centre X: 5 → 8`, `Diameter: 4 → 5`) updating ONLY `A2` to `(-2, 5) Ø5 THRU`.

## Screenshots

- `01-hole-table-created.png`: Hole table `ht1` created in clear sheet space with origin datum `O` (`+X`/`+Y`), tag bubbles `A1`/`A2`/`A3`, and `HOLE TABLE` grid.
- `02-renamed-reordered-moved.png`: Tag `A3` renamed to `B1`, reordered to row 2, and table nudged with coordinates invariant.
- `03-reopened-hole2-edited.png`: Fresh `.bcad` reopen + post-Open edit of Hole `n4` (`Centre X: 5 → 8`, `Diameter: 4 → 5`) updating only `A2` (`-2, 5, Ø5 THRU`).

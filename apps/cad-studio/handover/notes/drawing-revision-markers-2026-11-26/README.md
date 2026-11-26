# D2022 — Drawing Revision Change Markers & Zone/Sheet Auto-Tracking (#227)

- **Date:** 2026-11-26
- **Issue:** [#227](https://github.com/barocss/cad/issues/227)
- **Track:** P2 Drawings

## Scope Delivered
- **Paper-space revision change markers (`packages/barocss-cad-model/src/drawing/revisionMarkers.ts`, `types.ts`, `sheets.ts`, `sheet.ts`):**
  - Adds `DrawingRevisionMarker` (`id`, `revision`, `sheet`, `at`, optional presentation-only `hidden: true`) stored in `DrawingSettings.revisionMarkers` (schema 3/4 compatible).
  - Binds each marker to a recorded revision label (`DrawingRevision.revision`) and stable sheet ID (`FIRST_SHEET_ID = 'S1'` for Sheet 1; `DrawingSheet.id` for later sheets).
  - Defines a deterministic paper border-grid zone contract in sheet mm inside the inner sheet frame `[10, 10, W - 10, H - 10]`, strictly invariant to zoom, drawing scale, projection, and mm/inch display units:
    - `A4` landscape (`297×210 mm`): 4 rows `A–D` (top → bottom) × 6 columns `1–6` (left → right).
    - `A3` landscape (`420×297 mm`): 6 rows `A–F` (top → bottom) × 8 columns `1–8` (left → right).
  - Multi-sheet `forSheet` / `mergeSheet` ownership scopes marker rendering per sheet while carrying whole-drawing `sheetEntries` and `allRevisionMarkers` on `SheetContext` so Sheet 1's `REVISIONS` table always computes deduplicated, sorted multi-sheet `SHEETS` and `ZONES`.
  - Deleting a sheet (`removeSheet`) or deleting a revision row never silently moves or relinks markers; `nextSheetId` reserves deleted-sheet IDs still referenced by orphaned markers, and `resolveRevisionMarkers` + `drawingIssues` diagnose `REVISION_MARKER_ORPHAN` and `REVISION_MARKER_OFF_SHEET` with explicit `remove-revision-marker` fixes.
- **Auto/Manual Summary Overrides (`metadata.ts`, `options.ts`, `DrawingMetadata.tsx`):**
  - Adds optional `autoSheets`, `autoZones`, `manualSheets`, and `manualZones` fields to `DrawingRevision` while keeping drawings without markers/overrides byte-identical (`REV | DATE | DESCRIPTION | BY`).
  - Live current-marker summary (never an issued frozen snapshot; never invents or alters `date`, `by`, `eco`, `description`, or `revision`).
  - Explicit `manualSheets` / `manualZones` overrides are preserved across marker moves and `Auto sheets` / `Auto zones` off→on toggles until explicitly cleared via `Reset`.
- **Saved Admission, Studio UX & Exports (`savedAnnotationRefs.ts`, `io/svg.ts`, `DrawingWorkspace.tsx`, `ExportActions.tsx`):**
  - Raw saved `.bcad` admission rejects malformed `revisionMarkers` (duplicate IDs, non-finite coordinates, invalid revision/sheet strings) with explicit `DRAWING_OPTIONS`.
  - Adds `Revision marker` (`I`) placement tool (refuses off-sheet or unrecorded-revision placement without mutating `doc`), `Select` paper drag with `Escape` cancel, `REVISION MARKERS` sidebar list (`Move`, `Hide`/`Show`, `Remove`), SVG `<g class="revision-marker" data-revision-marker="…">`, AC1015/R12 DXF polyline+text export, and explicit DXF compatibility note.

## Verification
- **Typecheck & Build:**
  - `pnpm --filter @barocss/cad-model exec tsc --noEmit`: PASS
  - `pnpm --dir apps/cad-studio exec tsc --noEmit`: PASS
  - `pnpm build`: PASS
- **Model Unit & Regression Tests (`26/26` PASS):**
  - `drawing-revision-markers.test.ts` (4/4): border-grid boundaries, `A4 → A3`, off-sheet refusal, scale & mm/inch invariance, multi-sheet Revision B deduplication, move/hide/delete, sheet rename/reorder/delete, revision delete orphan diagnosis, auto → manual override → move → auto toggle off/on → explicit reset, `.bcad` round-trip, raw admission rejection, and AC1015/R12 DXF readback.
  - Regressions: `drawing-metadata` (13/13), `drawing-hole-table` (3/3), `drawing-ordinate` (4/4), `drawing-annotation-sig-admission` (2/2).
- **Real Chrome E2E (`D2022_SOURCE_FROZEN=1` + `D2021_SOURCE_FROZEN=1` regression):**
  - `apps/cad-studio/test/drawing-revision-markers-browser.mjs`: PASS
  - `apps/cad-studio/test/drawing-hole-table-browser.mjs`: PASS

## Visual Captures
1. `01-multisheet-markers-placed.png` — Sheet 1 with `rm1` (`A1`), Sheet 2 `rm2` (`C4`), and live multi-sheet `REVISIONS` table (`SHEETS: 1, 2`, `ZONES: A1, C4`).
2. `02-manual-override-preserved.png` — `MANUAL-Z` override preserved after moving `rm1` to `A3` and toggling `Auto zones` off/on.
3. `03-reset-and-reopened.png` — Fresh `.bcad` reopen after Reset showing restored `rm1` (`A3`), `REVISIONS` table (`SHEETS: 1, 2`, `ZONES: A3, C4`), and invariant part geometry (`76.8 g`, `60 × 40 × 12`).

## Boundaries
- Live current-marker summary (not an issued frozen revision snapshot); no auto-generated approval/date/ECO/description.
- DXF exports markers as non-associative triangle polylines and text; PDF golden and schema 5/migration HOLDs remain unchanged.

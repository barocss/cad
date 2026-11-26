# D2026 — Sheet-Metal Flat DXF Cut/Bend/Note Roles & Bend/Included Angles (#199)

- **Date:** 2026-11-26
- **Issue:** [#199](https://github.com/barocss/cad/issues/199)
- **Track:** P2 Exchange & Drawings

## Scope Delivered
- **Backward-Compatible DXF Role Profiles & Included Angle Semantics (`packages/barocss-cad/src/frame-sheet/sheet-flat.ts`, `packages/barocss-cad/src/index.ts`):**
  - Keeps `flatPatternDxf(flat)` (default) 100% byte-for-byte identical to existing frozen `conformance/r12/flat-dxf/` artifacts (`OUTLINE`, `BEND_UP`, `BEND_DOWN`, `BEND_NOTES`).
  - Adds additive `FlatPatternDxfProfile` (`'default' | 'shop' | 'cut-only'`) and `FlatPatternDxfOptions` (`profile`, `includeBendLines`, `includeBendNotes`, `separateCutLayers`, `includeIncludedAngle`, `textHeight`):
    - **`'shop'`:** separates `INNER_CUT` (inner holes/slots written before `OUTER_CUT`, preserving exact `LINE`/`ARC`/`CIRCLE`/`SPLINE` without resampling), dashed `BEND_UP`/`BEND_DOWN` centerlines, and `BEND_NOTES` carrying explicit `BEND <deg>° (INCL <180-deg>°)`.
    - **`'cut-only'`:** strictly cut boundaries only (`INNER_CUT` + `OUTER_CUT`, `linetypes: []`), with zero bend centerlines and zero `TEXT` entities.
  - Strictly refuses invalid `textHeight`, unsupported profiles, unknown option keys (e.g. `pocket`), non-boolean flags, and contradictory `cut-only` + bend-line/note options with `INVALID_INPUT`.
  - Adds `includedBendAngle(bendAngleDeg)` (`180 - bendAngleDeg`) and `FlatBend.includedAngle` without altering `FlatBend.angle` (bend angle rotated from flat).
- **Drawing Bend Table & Studio Flat Pattern Dialog (`packages/barocss-cad-model/src/drawing/tables.ts`, `apps/cad-studio/src/ui/FlatPatternDialog.tsx`):**
  - Adds optional `BendTableOptions` (`includeIncludedAngle?: boolean`) to `bendTable`, preserving the default 8-column table while offering explicit 9-column `BEND ANGLE` / `INCLUDED` separation (`58.0°` ↔ `122.0°`) alongside bend-table row provenance and estimate notes.
  - Adds pure local DXF profile (`Default` / `Shop` / `Cut-only`), `Bend lines`, `Bend notes`, and `Included angle` toggles in `FlatPatternDialog` (zero document/history/Undo mutation), live SVG preview sync, per-bend `Bend` + `Included` + `BA`/`BD` summary, and explicit boundary note stating that DXF layer separation/entity order is not a CAM toolpath guarantee.

## Verification
- **Kernel Build, Conformance, Unit & `ezdxf 1.4.5` Oracle Tests:**
  - `pnpm --filter @barocss/cad build:library` — PASS
  - `packages/barocss-cad/test/r12-2.test.mjs` (`6/6` PASS, including all 3 frozen byte-for-byte fixtures `channel-hole`, `pcb-enclosure`, `tray-holes`)
  - `packages/barocss-cad/test/sheet-flat-dxf-roles.test.mjs` (`3/3` PASS): `30°/58°/90°/120°/150°` bend+included sum = `180°`, Z-bracket (`58°` UP + `90°` DOWN + circular hole + rounded slot) across `default`/`shop`/`cut-only` in `AC1015` & `AC1009`, independent `ezdxf 1.4.5` audit (`errors: [], fixes: []`, `insunits: 4`), flat invariance, and `INVALID_INPUT` refusals.
  - `pnpm --filter @barocss/cad test:api-smoke` (`22/22` PASS)
- **Model & Studio Typecheck, Unit Tests & Build:**
  - `tsc --noEmit` (Model & Studio) + `pnpm build` — PASS
  - `drawing-bend-angles.test.ts` (`1/1` PASS) + `drawing-table.test.ts` bend-table tests — PASS
- **Real Chrome E2E (`D2026_SOURCE_FROZEN=1`):**
  - `apps/cad-studio/test/sheet-flat-dxf-roles-browser.mjs` — PASS (including independent `ezdxf 1.4.5` audit on browser-downloaded `shop` & `cut-only` DXFs and zero Doc/Undo/History mutation).

## Visual Captures
1. `01-flat-default-dialog.png` — `Default (OUTLINE)` profile on the 58°/90° Z-bracket showing structured `Bend 58° · Included 122°` and `Bend 90° · Included 90°` readout and explicit DXF role boundary note.
2. `02-flat-shop-angles.png` — `Shop (OUTER/INNER + Incl)` profile showing live `UP BEND 58° (INCL 122°) R2` and `DOWN BEND 90° (INCL 90°) R2` annotations.
3. `03-flat-cut-only.png` — `Cut-only (no bends/notes)` profile omitting all bend lines and notes while preserving outer boundary, rounded slot, and circular hole contours.

## Boundaries
- Scoped to sheet-metal flat DXF layer roles, cut-only/shop export options, and bend vs included angle semantics; pocket machining, etch/text provenance, bend-crossing cuts, multi-body naming, unfolded-solid editing, CAM toolpath generation, and manufacturing/P2/PG11 HOLDs remain out of scope.

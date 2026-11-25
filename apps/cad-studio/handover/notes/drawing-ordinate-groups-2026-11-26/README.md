# D2018 — Common-Origin Ordinate Dimension Groups (#219)

Date: 2026-11-26  
Track: P2 Drawings (`#219`)  
Scope: Source-bound common-origin ordinate dimension groups (`DrawingOrdinateGroup`, `DrawingOrdinateMember`, `DrawingSettings.ordinateGroups`) on ordinary unbroken orthographic views (`front`, `top`, `right`).

## Contract & Truth Rules

- **Explicit origin & member identity (`packages/barocss-cad-model/src/drawing/ordinate.ts`):**
  - Each group binds one explicit datum `origin: DimPoint`, one `axis: 'horizontal' | 'vertical'`, presentation-only `lineCoord` (baseline coordinate in view mm), and explicit `members[]` (`id`, `point: DimPoint`, optional presentation-only `jog` in sheet mm).
  - Measured coordinates are signed differences in model mm (`memberCoord - originCoord`), completely invariant to whole-part translation, sheet layout, scale, `lineCoord` baseline moves, individual member `jog` offsets, and display units (`mm` / `inch` / `dual` / `precision`).
  - Origin `0` renders with a distinct hollow datum circle at the baseline (`r = 0.85 mm`) and is never conflated with a member at coordinate `0`.
  - Both sides of the origin are unambiguously signed (`-15`, `0`, `15`), and distinct targets sharing the same coordinate (e.g. two vertically aligned holes at `X = 25`) are preserved independently without deduplication.
- **Separated loss diagnostics (`drawing/issues.ts`):**
  - Origin loss invalidates the whole group (`ORDINATE_ORIGIN_LOST`, `remove-ordinate-group` fix) without fabricating `0` or rebinding to another edge.
  - Single member loss marks only that member lost (`ORDINATE_MEMBER_LOST`, `remove-ordinate-member` fix) while keeping all other healthy members live.
  - Broken views, assembly scope, and non-orthographic views are refused explicitly.
- **Persistence & integration:** Stored in existing schema 3 (`DrawingSettings.ordinateGroups`, no schema 5/migration), wired through `readDrawing`, `forSheet`/`mergeSheet`, `reorient`, `engine/references.ts` (signature capture & verification for origin and every member), `io/svg.ts` (`data-ordinate-group`), and `io/dxf.ts` (`THIN` witness lines/origin circle + `TEXT` labels).

## Verification

- **Model unit & regression tests (`packages/barocss-cad-model/test/drawing-ordinate.test.ts` + 6 regression suites):** `48/48` PASS.
  - Measures `10 / 25 / 40` from origin `(0, 0)`, verifies whole-part translation invariance (`+100, +50`), group `lineCoord` move & individual `jog` invariance, scale (`1:1` vs `1:2`), inch/dual formatting (`.394 [10]`), signed both sides (`-15`, `0`, `15`), duplicate-coordinate distinct holes, `ORDINATE_MEMBER_LOST` vs `ORDINATE_ORIGIN_LOST` + `applyFix`, broken/assembly refusals, `readDrawing`, `captureSignatures`/`verifyReferences`, multi-sheet `forSheet`/`mergeSheet`, `reorient`, SVG, and DXF.
- **Typecheck, lint & build:** Model `tsc --noEmit`, Studio `tsc --noEmit`, scoped `eslint`, `pnpm build`: PASS.
- **Real Chrome E2E (`D2018_SOURCE_FROZEN=1 node test/drawing-ordinate-browser.mjs`):** PASS.
  - Verified Escape cancel leaves Doc unchanged, created horizontal group `ord1` at `(0, 0)` with hole members `10`, `25`, `40`, verified `Move baseline ord1` and `Toggle jog for m2` (`jog = 5`) preserve `10, 25, 40`, Undo/Redo, SVG & DXF export, `.bcad` Save/Open, and post-Open Hole 3 `Centre X: 40 → 48` updating `m3` live `40 → 48`.
- **Chrome regression (`D2017_SOURCE_FROZEN=1 node test/drawing-center-of-mass-browser.mjs`):** PASS.

## Captured Scenes

- [01-ordinate-0-10-25-40.png](01-ordinate-0-10-25-40.png) — Horizontal ordinate group `ord1` with datum origin circle `0` and hole members `10`, `25`, `40`.
- [02-moved-and-jogged.png](02-moved-and-jogged.png) — Baseline moved upward and member `m2` (`25`) jogged with 3-segment leader while values stay `10`, `25`, `40`.
- [03-reopened-hole3-48.png](03-reopened-hole3-48.png) — Fresh `.bcad` Open followed by Hole 3 `Centre X: 40 → 48` updating `m3` live to `48`.

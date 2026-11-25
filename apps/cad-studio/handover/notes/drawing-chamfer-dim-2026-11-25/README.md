# D2006 — 45° Chamfer Drawing Dimension (`#246`)

Date: 2026-11-25  
Track: P2 Drawings (`#246`)  
Status: **PASS** (unit + type-check + ESLint + production build + real Chrome E2E + visual inspection + D2005 Chrome regression)

## Summary

Implemented native 45° chamfer drawing dimensions (`kind: 'chamfer'`) bound to a verified bevel edge and adjacent straight wall (`chamfer: EdgeRef`, `adjacent: EdgeRef`) in ordinary unbroken orthographic views (`front`, `top`, `right`), displaying `<setback> × 45°`.

### Design & Invariants
- **Strict 3D equal-setback 45° verification:** [`packages/barocss-cad-model/src/drawing/chamferDim.ts`](../../../../packages/barocss-cad-model/src/drawing/chamferDim.ts) verifies both edges are visible native straight lines lying parallel to the view plane (true shape, no foreshortening), share one exact 3D corner vertex (rejecting screen-only crossings at different depths), meet at a raw bevel angle within `±0.01°` of `45°` before any display rounding (rejecting `44.96°`, `30°`, `60°`), and have a perpendicular opposite parent wall meeting the bevel's far 3D vertex at symmetric `45°`.
- **Measures setback `d`, not bevel hypotenuse `d√2`:** Computes both setback legs independently from raw 3D coordinates, verifies equality, and reports `d` (e.g. `2 × 45°` for a `2 mm` chamfer, updating to `3 × 45°` after editing Chamfer distance `2 → 3 mm`).
- **Length-only unit conversion:** In inch and dual displays, only the setback length converts (`2 mm → .079 × 45°`, dual `2.000 × 45° [.0787 × 45°]`); `45°` never converts. First profile intentionally excludes tolerance, fit, basic, count, and Auto-dimension (stripped on load and refused on resolve).
- **Old-reader safety without schema 5:** Stores nested `chamfer: EdgeRef` and `adjacent: EdgeRef` (no top-level `edge`/`near`/`a`/`b`) so older readers cannot misread it as radius or angle.
- **Studio, exports & persistence:** Two-edge `45° Chamfer` tool (`C`) with live preview, explicit refusal of fillets/non-touching edges, Escape cancel, FIRST Undo/Redo, explicit `Reselect` for unresolved chamfer rows preserving ID/place, SVG leader/arrowhead/`2 × 45°` text, DXF 2000/R12 drawn marks (zero fake `DIMENSION` entities + Studio compatibility note), 3D PMI (`modelAnnotations`), `reorient`, `referencesOf`, `dimensionEdgeNames`, and `renameDimension`.

## Verification

1. **Unit & contract tests (`42/42 PASS` + `4/4 PASS`):**
   - `pnpm --dir packages/barocss-cad-model test -- drawing-chamfer-dim drawing-arc-length drawing-extension-jog drawing-crossing-break drawing-linear-arrows drawing-breaks drawing-foreshortened-radius drawing-fractional-inch annotations3d referencesCopy`
   - `pnpm --dir apps/cad-studio test -- tolerance-input-units`
   - Covers `20 × 10 × 6 mm` plate with `2 mm` 45° chamfer (`2 × 45°`, distinct from `2√2`), source edit `2 → 3 mm` (`3 × 45°`), label move invariance, inch (`.079 × 45°`), dual/precision (`2.000 × 45° [.0787 × 45°]`), strict rejection of `44.96°`/`45.04°`/`30°`/`60°`, depth-offset crossings, oblique bevels, fillets, non-touching edges, unsupported tol/basic/count, iso/section/detail/broken views, deleted chamfer (`DIMENSION_LOST`), SVG, DXF 2000 & R12, 3D PMI, `reorient`, `referencesOf`, and explicit Dimension CSV refusal.
2. **Type-check, ESLint, production build:**
   - `pnpm --dir packages/barocss-cad-model type-check` — PASS
   - `pnpm --dir apps/cad-studio type-check` — PASS
   - Touched-file ESLint in both packages — PASS (0 errors, 0 warnings)
   - `pnpm build` — PASS
3. **Real Chrome E2E (`D2006_SOURCE_FROZEN=1`, PASS):**
   - `apps/cad-studio/test/drawing-chamfer-dim-browser.mjs`: opens `20 × 10 × 6 mm` plate with `2 mm` 45° chamfer + `R2` fillet negative control, refuses fillet arc and non-touching bottom edge, cancels with Escape (doc & history unchanged), places `2 × 45°`, verifies inch `.079 × 45°`, drags label, verifies FIRST Undo/Redo, downloads & verifies SVG (`2 × 45°`) and DXF (`2 × 45%%d`, 0 `DIMENSION` entities), saves `.bcad`, reopens in a fresh Chrome session, edits Chamfer distance `2 → 3 mm`, and verifies `3 × 45°`.
   - D2005 Chrome regression (`drawing-arc-length-browser.mjs`, `D2005_SOURCE_FROZEN=1`) — PASS.

## Screenshots

- [00-baseline.png](00-baseline.png) — `20 × 10 × 6 mm` plate with `2 mm` 45° chamfer and `R2` fillet before dimensioning
- [01-placed-2x45.png](01-placed-2x45.png) — Placed `2 × 45°` chamfer callout anchored at bevel midpoint
- [02-inch-079x45.png](02-inch-079x45.png) — Inch unit display converting length only (`.079 × 45°`)
- [03-reopened-saved.png](03-reopened-saved.png) — Fresh `.bcad` reopen preserving `2 × 45°`
- [04-after-chamfer-3mm.png](04-after-chamfer-3mm.png) — Post-Open Chamfer distance edit `2 → 3 mm` updating to `3 × 45°`

## Scope Boundaries

- Ordinary unbroken `front`, `top`, and `right` views only; non-45° chamfers, curved bevels, countersinks, silhouettes, tolerances/fits/basic/count, `iso`/`section:*`/`detail:*`/broken views, and assembly scopes remain outside this first profile.
- Existing PDF golden / ASME mismatch HOLD (`#35`) stays separate.

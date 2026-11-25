# D2007 — Concentric Radial Thickness Drawing Dimension (`#244`)

Date: 2026-11-25  
Track: P2 Drawings (`#244`)  
Status: **PASS** (unit + type-check + ESLint + production build + real Chrome E2E + visual inspection + D2006 Chrome regression)

## Summary

Implemented native concentric radial thickness drawing dimensions (`kind: 'radial-thickness'`) bound to two distinct coplanar concentric full circular edges (`first: EdgeRef`, `second: EdgeRef`) in ordinary unbroken orthographic views (`front`, `top`, `right`), measuring `R - r` mm along the user-chosen radial ray.

### Design & Invariants
- **Strict 3D concentricity, coplanarity, and full-circle verification:** [`packages/barocss-cad-model/src/drawing/radialThickness.ts`](../../../../packages/barocss-cad-model/src/drawing/radialThickness.ts) verifies both circles are visible native full circles (supporting both single-edge `full: true` and seam-split 360° rims like `180° + 180°` holes while strictly rejecting partial arcs), show round in the view (`roundIn`), share identical 3D center and parallel plane normals (rejecting screen-overlapping circles at different depths), and have distinct radii (`R - r > 1e-4`).
- **Order-independent value & exact circumference endpoints:** Picking outer-then-inner or inner-then-outer produces the exact same `value = R - r`, `innerPoint = C + r·u`, and `outerPoint = C + R·u` along the placement ray `u`. Refuses clicking directly on the shared circle center during placement.
- **Old-reader safety without schema 5:** Stores nested `first: EdgeRef` and `second: EdgeRef` (no top-level `edge`/`near`/`a`/`b`) so older readers cannot misread radial thickness as radius, diameter, or linear.
- **Studio, exports & persistence:** Two-circle `Wall thickness` tool (`W`, `CircleDot` icon) with live preview, same-circle/partial-arc refusal, Escape cancel, FIRST Undo/Redo, explicit `Reselect` for unresolved rows preserving ID/place/tolerance/basic, SVG radial dimension + outside-arrow thin-wall layout, DXF 2000/R12 drawn marks (zero fake `DIMENSION` entities + Studio compatibility note), 3D PMI (`modelAnnotations`), `reorient`, `referencesOf`, `dimensionEdgeNames`, and `renameDimension`.

## Verification

1. **Unit & contract tests (`45/45 PASS` + `4/4 PASS`):**
   - `pnpm --dir packages/barocss-cad-model test -- drawing-radial-thickness drawing-chamfer-dim drawing-arc-length drawing-extension-jog drawing-crossing-break drawing-linear-arrows drawing-breaks drawing-foreshortened-radius drawing-fractional-inch annotations3d referencesCopy`
   - `pnpm --dir apps/cad-studio test -- tolerance-input-units`
   - Covers `R=20 / r=15` ring (`5 mm`), order independence across 4 radial angles, circumference endpoint exactness, source edits `r=15 → 16 mm` (`4 mm`) and `R=20 → 22 mm` (`6 mm`), scale `0.5 / 1`, dual/inch (`5 [.197]`), strict rejection of same circle, eccentric circles, different-depth coaxial circles (`z=10` vs `z=4`), partial fillet arcs, non-round/iso/section/detail/broken views, deleted hole (`DIMENSION_LOST`), SVG, DXF 2000 & R12, 3D PMI, `reorient`, `referencesOf`, and explicit Dimension CSV refusal.
2. **Type-check, ESLint, production build:**
   - `pnpm --dir packages/barocss-cad-model type-check` — PASS
   - `pnpm --dir apps/cad-studio type-check` — PASS
   - Touched-file ESLint in both packages — PASS (0 errors, 0 warnings)
   - `pnpm build` — PASS
3. **Real Chrome E2E (`D2007_SOURCE_FROZEN=1`, PASS):**
   - `apps/cad-studio/test/drawing-radial-thickness-browser.mjs`: opens `R=20 / r=15 / H=10 mm` concentric ring, refuses same-circle pick + cancels with Escape (doc & history unchanged), picks outer + inner circles and places `5`, verifies inch `.197`, drags to another radial angle (`5` unchanged), verifies FIRST Undo/Redo, downloads & verifies SVG (`5`) and DXF (`5`, 0 `DIMENSION` entities), saves `.bcad`, reopens in a fresh Chrome session, edits Hole diameter `30 → 32 mm` (`r = 16 mm`), and verifies automatic update to `4`.
   - D2006 Chrome regression (`drawing-chamfer-dim-browser.mjs`, `D2006_SOURCE_FROZEN=1`) — PASS.

## Screenshots

- [00-baseline.png](00-baseline.png) — `R=20 / r=15 / H=10 mm` concentric ring before dimensioning
- [01-placed-5mm.png](01-placed-5mm.png) — Placed `5` radial wall thickness dimension between `R=20` and `r=15`
- [02-inch-197.png](02-inch-197.png) — Inch unit display (`.197`)
- [03-reopened-saved.png](03-reopened-saved.png) — Fresh `.bcad` reopen preserving `5`
- [04-after-hole-r16.png](04-after-hole-r16.png) — Post-Open Hole edit `Ø30 → Ø32 mm` (`r=16`) updating to `4`

## Scope Boundaries

- Ordinary unbroken `front`, `top`, and `right` views with two coplanar concentric full circles only; partial arcs, eccentric/intersecting circles, non-coplanar depth overlaps, silhouettes, `iso`/`section:*`/`detail:*`/broken views, and assembly scopes remain outside this first profile.
- Existing PDF golden / ASME mismatch HOLD (`#35`) stays separate.

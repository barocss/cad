# D2005 — Arc Length Drawing Dimension (`#234`)

Date: 2026-11-25  
Track: P2 Drawings (`#234`)  
Status: **PASS** (unit + type-check + ESLint + production build + real Chrome E2E + visual inspection + D2004 Chrome regression)

## Summary

Implemented native circular arc-length drawing dimensions (`kind: 'arc-length'`) bound to one persistent partial circular arc reference (`arc: EdgeRef`) in ordinary unbroken orthographic views (`front`, `top`, `right`).

### Design & Invariants
- **Exact model arc length (`L = r · sweep`):** [`packages/barocss-cad-model/src/drawing/arcLength.ts`](../../../../packages/barocss-cad-model/src/drawing/arcLength.ts) extracts `radius`, `sweep`, `center`, exact CCW `[startAngle, startAngle + sweep]`, and exact 3D arc midpoint `mid3` directly from the projected native circular arc edge. Distinct from chord length (`2r sin(sweep/2)`) and radius (`r`).
- **Strict full-circle and unsupported-geometry refusal:** Rejects single-edge full circles (`e.circle.full`), seam-split full circles (e.g. two 180° hole-rim halves summing to `2π` at the same 3D center, radius, and plane), straight lines, silhouettes, splines/ellipses, non-round views, and `iso` / `section:*` / `detail:*` / broken views.
- **No conjugate-arc flip on drag:** Concentric dimension arc spans the native arc's exact `[startAngle, startAngle + sweep]`; moving `place` adjusts only radial offset and never flips to `2π - sweep`.
- **Old-reader safety without schema 5:** Persisted data uses `{ id, view, kind: 'arc-length', arc: EdgeRef, place }` with no top-level `edge`/`near`, preventing older readers from falling through to `closestCircleEdge` and printing a fake radius `R`.
- **Format & exports:** Prints WinAnsi-safe `ARC <length>` across mm, inch, dual, precision, and tolerance formats (`pdfMissing` = empty); SVG emits exact `<path d="M...A...">` (including `large-arc-flag=1` for `sweep > π`), radial extensions, arrowheads, and text; DXF (2000 & R12) emits exact drawn `ARC`/`LINE`/`SOLID`/`TEXT` without misrepresenting arc length as a native DXF `RADIUS` or `ANGULAR` `DIMENSION`, paired with an explicit Studio DXF compatibility note; 3D PMI (`modelAnnotations`), `reorient`, `referencesOf`, `dimensionEdgeNames`, and `renameDimension` all preserve native `arc-length` semantics.

## Verification

1. **Unit & contract tests (`39/39 PASS`):**
   - `pnpm --dir packages/barocss-cad-model test -- drawing-arc-length drawing-extension-jog drawing-crossing-break drawing-linear-arrows drawing-breaks drawing-foreshortened-radius drawing-fractional-inch annotations3d referencesCopy`
   - `pnpm --dir apps/cad-studio test -- tolerance-input-units` (`4/4 PASS`)
   - Covers minor 90° fillet (`R=10 → 5π = 15.707963`, `ARC 15.71`), real B-rep 135° arc, exact 270° major arc (`L = 15π = 47.12389`, `ARC 47.12`, SVG `large-arc-flag=1`), drag across circle center without conjugate flip, source edit `R=10 → R=15` (`ARC 23.56`), scale/units/dual/tolerance, full-circle hole refusal, straight line / silhouette / non-round / iso / section / detail / broken / deleted-edge refusal, SVG, DXF 2000 & R12, 3D PMI, `reorient`, `referencesOf`, and explicit Dimension CSV refusal.
2. **Type-check, ESLint, production build:**
   - `pnpm --dir packages/barocss-cad-model type-check` — PASS
   - `pnpm --dir apps/cad-studio type-check` — PASS
   - Touched-file ESLint in both packages — PASS (0 errors, 0 warnings)
   - `pnpm build` — PASS
3. **Real Chrome E2E (`D2005_SOURCE_FROZEN=1`, PASS):**
   - `apps/cad-studio/test/drawing-arc-length-browser.mjs`: opens filleted `50 × 30 × 10 mm` plate (`R=10` corner fillet + `Ø10` through-hole), refuses full-circle hole rim and straight edge, picks partial arc and places `ARC 15.71`, drags across circle center without conjugate flip, verifies Undo/Redo back to baseline and forward again, verifies SVG and DXF exports (0 fake `DIMENSION` entities, `ARC 15.71` text preserved), saves `.bcad`, reopens in a fresh Chrome session, edits Fillet radius `10 → 15 mm`, and verifies automatic update to `ARC 23.56` (`7.5π`).
   - D2004 Chrome regression (`drawing-extension-jog-browser.mjs`, `D2004_SOURCE_FROZEN=1`) — PASS.

## Screenshots

- [00-baseline.png](00-baseline.png) — Filleted plate with `Ø10` through-hole before dimensioning
- [01-placed-arc-15-71.png](01-placed-arc-15-71.png) — Placed `ARC 15.71` concentric arc-length dimension on `R=10` quarter fillet
- [02-dragged-stable.png](02-dragged-stable.png) — Selected after dragging across center and outward (never flips to conjugate arc)
- [03-reopened-saved.png](03-reopened-saved.png) — Fresh `.bcad` reopen preserving `ARC 15.71`
- [04-after-fillet-r15.png](04-after-fillet-r15.png) — Post-Open Fillet radius edit `10 → 15 mm` updating to `ARC 23.56`

## Scope Boundaries

- Ordinary unbroken `front`, `top`, and `right` views only; `iso`, `section:*`, `detail:*`, broken views, full circles, silhouettes, and splines/ellipses remain explicitly refused.
- Existing PDF golden / ASME mismatch HOLD (`#35`) stays separate.

# D1996 — Optional fractional inch display for plain Drawing length dimensions (#275)

Date: 2026-11-25 · Track: P2 Row 11 (Drawings) · Issue: [#275](https://github.com/barocss/cad/issues/275)

## Decision

Add an optional drawing-level `inchFraction` setting (`2 | 4 | 8 | 16 | 32 | 64`) separate from `precision.inch` so plain untoleranced, non-basic, non-callout inch length dimensions display as reduced half-up fractions (`25.4 mm → 1`, `31.75 mm → 1 1/4`, `12.7 mm → 1/2`, `6.35 mm → R1/4`, `38.1 mm → 1 1/2`) while preserving original model geometry in mm and keeping toleranced dimensions, fits, basic dimensions, hole callouts, GD&T frames, datum targets, tables, and angles in decimal/degrees.

## Key contracts implemented

- **Exact rational arithmetic (`packages/barocss-cad-model/src/drawing/standard.ts`):** `formatFractionalInch(mm, denominator)` uses exact `BigInt` rational conversion from `decimalValue(mm)` (`inches * D = (|mm| * 5 * D) / 127`) with half-up tie-breaking on magnitude, irreducible fraction output, whole-number carry (`63.5/64 → 1`), and explicit bounds (`NaN`, `Infinity`, `|mm| > 1e15`, unsupported denominators return `{ ok: false, reason: 'invalid' }`).
- **Below-grid nonzero safeguard (`dimensions.ts`, `sheet.ts`, `issues.ts`):** A nonzero length smaller than half of `1/D` inch never prints `0`; `formatFractionalInch` returns `{ ok: false, reason: 'below-grid' }`, `withShownText` keeps decimal inch text and marks transient `fractionFallback: 'below-grid'`, and `drawingIssues` emits a `UNIT_PRECISION` warning naming the dimension.
- **Strict tolerance/callout isolation (`sheet.ts`):** `formatLength(...)` remains decimal globally; fractional formatting runs only in `withShownText` for `u === 'inch' && p.inchFraction !== undefined && r.kind !== 'angle' && !r.dim.tol && !r.dim.basic` and non-callout diameters, working identically for primary inch (`inch [mm]`) and secondary inch (`mm [inch]`).
- **Persistence, tool contract, and Studio UI (`types.ts`, `chat/drawing.ts`, `SheetSettings.tsx`):** `readDrawing` persists valid `inchFraction` values and strips invalid ones without changing schema version; `set_drawing` accepts `2 | 4 | 8 | 16 | 32 | 64 | "none"` and refuses unsupported denominators atomically (`DRAWING_OPTIONS`); Studio exposes `Inch format` inside `SHEET → Details` alongside `inch decimals` with an inline scope note.

## Verification

- **Unit tests (`packages/barocss-cad-model/test/drawing-fractional-inch.test.ts` + regression suite):**
  - 6/6 PASS in `drawing-fractional-inch.test.ts` (exact table across `1/2`..`1/64`, exact ties & carry, below-grid `UNIT_PRECISION` warning, toleranced/fit/basic/hole-callout/frame isolation, primary & dual `inch [mm]` / `mm [inch]`, SVG/DXF/3D annotation parity, `.bcad` Save/Open roundtrip, invalid stripping, `set_drawing` validation).
  - 55/55 PASS across `drawing-fractional-inch`, `drawing-units.test`, `drawing-issues`, `annotations3d`, `toolset.test` (v2 tool budget 24,775 <= 25,000 chars, frozen `tools-v2.json` unchanged).
- **Type-check, lint, and build:** `@barocss/cad-model` `type-check`, `@barocss/cad-studio-app` `type-check`, scoped ESLint on all 8 files, and `pnpm build` all PASS.
- **Actual Studio Chrome verification (`apps/cad-studio/test/drawing-fractional-inch-browser.mjs`):**
  - Baseline (`--baseline`, `D1996_SOURCE_FROZEN=1`): PASS (`00-previous-no-inch-fraction.png` confirms no `Inch format` control and decimal inch labels).
  - Current Studio (`D1996_SOURCE_FROZEN=1`): PASS across `1/16"` selection, actual SVG + DXF downloads (`>1 1/4</text>`, `>1/2</text>`, `>R1/4</text>`, `>1.0039 +.0004/-.0003</text>`, `>Ø.500 THRU</text>`, DXF `%%c.500 THRU`), dual `inch [mm]` and `mm [inch]`, `1/64"` Undo/Redo, source plate width edit `31.75 → 38.1 mm` (`1 1/4 → 1 1/2`), independent native B-rep mass/topology checks (`genus 1`, exact volume), and `.bcad` Save + fresh Open.

## Captured Studio scenes

- [00-previous-no-inch-fraction.png](00-previous-no-inch-fraction.png) — Baseline Studio before `Inch format` existed (decimal inch `1.250`, `.500`, `R.250`, `1.0039 +.0004/-.0003`, `Ø.500 THRU`).
- [01-inch-fraction-16.png](01-inch-fraction-16.png) — `1/16"` selected in `SHEET → Details`: plain lengths read `1 1/4`, `1/2`, `R1/4`; toleranced depth (`1.0039 +.0004/-.0003`) and hole callout (`Ø.500 THRU`) stay decimal; model bounds remain `31.75 × 25.5 × 12.7` mm.
- [02-dual-mm-inch-fraction.png](02-dual-mm-inch-fraction.png) — Dual `mm [inch]` with `1/16"`: `31.75 [1 1/4]`, `12.7 [1/2]`, `R6.35 [R1/4]`, `25.5 ±0.01 [1.0039 +.0004/-.0003]`, `Ø12.7 THRU [Ø.500 THRU]`.
- [03-source-edited-1-and-half.png](03-source-edited-1-and-half.png) — After source width edit `31.75 → 38.1 mm` at `1/64"`: plain width updates to `1 1/2` with native bounds `38.1 × 25.5 × 12.7` mm.
- [04-fresh-open.png](04-fresh-open.png) — After native `.bcad` Save and fresh Studio Open: `inchFraction: 64` and all displayed labels persist identically.

## Explicit boundaries

- PDF export conventions and the existing PDF golden HOLD remain untouched.
- Legacy readers without `inchFraction` ignore the optional field and render decimal inch without geometry loss.
- Arbitrary non-power-of-two denominators, architectural feet-inch notation, and fractional tolerancing remain outside scope.

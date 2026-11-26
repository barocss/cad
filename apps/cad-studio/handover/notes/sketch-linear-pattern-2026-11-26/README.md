# D2025 — Sketch Linear Circle Pattern Copy Constraints & Count Change (#223)

- **Date:** 2026-11-26
- **Issue:** [#223](https://github.com/barocss/cad/issues/223)
- **Track:** P1 Sketch & Constraints

## Scope Delivered
- **Derived Linear Circle Pattern Authority (`packages/barocss-cad-model/src/sketch/linearPattern.ts`, `types.ts`, `doc.ts`, `loops.ts`, `reopen.ts`, `entityIds.ts`, `corner.ts`):**
  - Adds `SketchLinearPattern` (`id`, `seedCircle`, `axis`, `sign`, `spacing`, `count`) and monotonic `patternSeq` on `Polygon` / `SketchOutline` (schema 3/4 compatible).
  - Seed circle + pattern definition remain the sole authority: derived copies (`ordinal = 1 .. count - 1`) are recomputed strictly from `(seed.c, seed.r, axis, sign, spacing, ordinal)` and never duplicated as independent circles on reopen (`sketchShapes`).
  - Assigns deterministic lineage-bound hole side tags (`${pattern.id}_k${ordinal}`, e.g. `sp1_k1`, `sp1_k2`) in `profileOf` / `sideTags` so downstream `Extrude` consumes all copies as closed through-holes with stable identity.
  - Monotonic `patternSeq` ensures deleting `sp1` and recreating a pattern at the same location produces `sp2` (never reusing deleted pattern IDs).
- **Zero-Extra-DOF Copy-Driven Constraints & Safe Count Reduction (`terms.ts`, `profile.ts`, `rules.ts`, `select.ts`, `outlineFields.ts`):**
  - Adds `PatternCopyDimRule` (`kind: 'pcdx' | 'pcdy'`, `a`, `pattern`, `ordinal`, `side`, `value`) solving `C_seed[m] - p_a[m] = side * value - offset[m]` directly on the seed circle via a positive-length 3-helper chain (+6 vars / 7 eqs = net −1 DOF, zero extra DOF, exact sign preservation).
  - Rejects non-integer/out-of-range counts, non-positive/non-finite spacing, missing/duplicate seed, overlapping circles, copies crossing/exiting the outline, over-defining seed constraints, and malformed saved `.bcad` patterns.
  - Count reduction (`3 → 2`) or pattern removal while a disappearing copy is referenced is explicitly refused without mutating accepted sketch/history; explicit opt-in (`dropReferencedConstraints: true`) drops only affected constraints in one atomic Undo-reversible transaction without silent retargeting or later auto-resurrection on `2 → 3`.
- **Studio Sketch UX (`SketchMarks.tsx`, `ConstraintTools.tsx`):**
  - Renders derived pattern copies with dashed outlines (`data-pattern-copy`), viewport picking (`pattern-circle`), `Copy X` / `Copy Y` driving dimensions, `LINEAR PATTERNS` card (add/edit/remove), and explicit constraint-removal confirmation on refused count reduction.

## Verification
- **Typecheck & Build:** `tsc --noEmit` (Model & Studio) + `pnpm build`: PASS.
- **Model Unit & Regression Tests (`15/15` PASS):**
  - `sketch-linear-pattern.test.ts` (3/3): `[0,50]×[0,20]` analytic fixture with seed `(5,10)` R=2, +X spacing 10 mm, count 3; copy `#2` X `25 → 27` drives seed `5 → 7` (`dof: 1 → 0`, residual `< 1e-7`), over-define refusal, native `Extrude(h=3)` volume `3000 − 36π mm³`, Feature Editor `27 → 29`, `.bcad` Save/Open round-trip, count `3 → 2` refusal + explicit atomic drop + no resurrection on `2 → 3` + fresh `sp2` on recreate, negative inputs & malformed saved pattern rejection.
  - Regressions: `sketch-axis-diameter` (5/5), `sketch-edge-circle-gap` (4/4), `sketch-reference-dimensions` (3/3).
- **Real Chrome E2E (`D2025_SOURCE_FROZEN=1` + `D2020_SOURCE_FROZEN=1` regression):**
  - `apps/cad-studio/test/sketch-linear-pattern-browser.mjs`: PASS
  - `apps/cad-studio/test/sketch-axis-diameter-browser.mjs`: PASS

## Visual Captures
1. `01-pattern-copy-constrained.png` — Fully defined `[0,50]×[0,20]` sketch with seed `(5,10)`, derived copies `sp1:1`/`sp1:2`, and driving X dimension `25` on copy `#2`.
2. `02-copy-driven-27.png` — Copy `#2` X edited `25 → 27`, driving seed X `5 → 7` (`(7,10)`, `(17,10)`, `(27,10)`).
3. `03-finished-extrude-3holes.png` — Finished 3D Extrude (`50 × 20 × 3`, exact volume `3000 − 36π mm³`) with 3 through-holes.
4. `04-reopened-feature-edit-29.png` — Fresh `.bcad` reopen + Feature Editor edit `27 → 29` (`9, 19, 29` hole centers, exact volume preserved).

## Boundaries
- Scoped to 1D linear circle patterns on closed outlines with literal positive spacing and integer count `2..16`; direct copy drag, 2D grids/circular/mirror sketch patterns, nested patterns, expressions (`#206`), and schema 5/migration HOLDs remain out of scope.

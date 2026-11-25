# D1993 — Repeat an earlier circular through-cut across multi-cut rectangular Difference chains

P1 [row 3](../../roadmap-rows/03.md) and [row 8](../../roadmap-rows/08.md), [#25](https://github.com/barocss/cad/issues/25). Base `076c63f25df0962fb9058723ff952f23a7c42848`. Full geometry change.

`packages/barocss-cad/src/part/part-model.ts` and `part-prior-circular-cut.ts` previously admitted an earlier original circular through-Subtract only when `links.length === 2` (exactly one later rectangular through-Subtract). Extending `PriorCircularCut.later` to a sequence of one or more original full-height rectangular through-Subtracts along the direct Difference chain allows `Linear`, `Rectangular`, `Fill`, and `Path` cut patterns to repeat the earlier circular through-cut while certifying strict interior clearance, mutual cavity disjointness, cavity retention at every stage, and strict clearance of every patterned circular copy against every later rectangular cavity before any Boolean runs.

- **Previous Studio (FAIL):** On a `60 × 40 × 10 mm` plate with `Subtract 1 (n4)` circular R2 at `(10, 10)`, `Subtract 2 (n7)` `[24..28, 8..10]`, and `Subtract 3 (n10)` `[42..46, 8..12]`, selecting `Subtract 1 (n4)` in Browser and opening `Linear cut pattern` (Count 2, Spacing 8) refused preview solely because two later rectangular cuts followed it.
- **Actual Chrome PASS:** Selecting `Subtract 1 (n4)` refuses Spacing 32 (`(42, 10)` colliding with the second later rectangular cut `n10`) with unchanged document and History; applies Count 2, Spacing 8 (`(10, 10)` and `(18, 10)`); edits History Spacing `8 → 24` (`(34, 10)`, landing cleanly between `n7` and `n10`); passes Undo/Redo and actual `.bcad` Save and fresh Open.
- **Independent native geometry (PASS):** All states pass strict `checkBrep`, 1 shell, genus `2 + N` (`genus 4` for 2 circles + 2 rectangles), exact cylinder geometry (`R2`, outward `-1`, Z-axis), untouched rectangular openings `[24..28, 8..10]` and `[42..46, 8..12]`, exact volume `23,760 − 80π = 23,508.672587713 mm³`, and exact analytical centroids.
- **Focused checks & regressions:** 33 Kernel tests (`prior-circular-cut-chain` across 2-later and 3-later chains for Linear, Rectangular, Fill and quadratic Path plus collision/overlap/non-rectangular refusals, and all 5 existing prior-cut suites), `@barocss/cad` `test:api-smoke`, `@barocss/cad-model` `type-check`, full `pnpm build`, and actual Chrome regression replay of D1901 (`prior-circular-linear-cut-pattern-browser.mjs`) pass.
- **Remaining scope:** Non-rectangular later cuts (e.g. a second circular cut), general curved paths, and broader pattern reference recovery remain open on [#25](https://github.com/barocss/cad/issues/25).

[Previous chain refused](studio/00-previous-chain-refused.png) · [Later cut 3 collision refused](studio/01-later-cut-3-collision-refused.png) · [Linear applied (x8)](studio/02-linear-applied.png) · [History edited (x24)](studio/03-history-edited-x24.png) · [Fresh Open](studio/04-fresh-open.png)

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prior-circular-cut-chain,prior-circular-linear-cut-pattern,prior-circular-rectangular-cut-pattern,prior-circular-fill-cut-pattern,prior-circular-path-cut-pattern,prior-path-cut-pattern}.test.mjs
D1993_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-cut-chain-browser.mjs /tmp/cad-d1993-studio
D1901_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-linear-cut-pattern-browser.mjs /tmp/cad-d1993-reg-d1901
```

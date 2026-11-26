# D2030 — Repeat an earlier through-bore on an XY grid past later mixed cuts

P1, [#25](https://github.com/barocss/cad/issues/25). Follows [D2029](../prior-circular-mixed-linear-2026-11-26/README.md), which admitted the same native difference chain for the signed Linear producer only.

Rectangular cut pattern now accepts a selected original round through-cut followed by disjoint original rectangular and circular through-cuts on upright rectangular stock. The existing certificate checks the stock and every original subtraction, then every grid cell, including its diagonals. The producer translates only the original requested cutter. Fill and Path retain the prior rectangle-only rule for later cuts in this circular-source route. Pockets, transformed cutters, non-XY grids and non-certified cavities are not admitted by this change.

## Evidence

- **Desktop Chrome/WebGPU:** [previous main refused the valid mixed grid](studio/00-prior-refusal.png). On the updated source, a 2 × 2 grid at 8/8 mm copies the R2 bore at (10,10), retaining both the later R3 at (44,18) and the later 4 × 2 mm rectangle. At a first spacing of 29 or 32 mm each axial copy alone previews, but [the diagonal's tangency](studio/01-diagonal-tangent-refused.png) or overlap refuses without a Document or History mutation.
- **History:** changing only the second spacing from 8 to 14 moves just the second row from Y18 to Y24. Undo/Redo and [save, fresh Open](studio/02-fresh-open.png) restore the native result.
- **Independent geometry checks:** both cap planes have all six through openings; native cylindrical walls for the four R2 and one R3 bores preserve the expected axes, outward direction and source/occurrence names. The strict B-rep is one shell, genus six. Analytic volume (24,000 - 80 - 250π) = 23,134.601836602553 mm³ and analytic first moments match the inspected solid.
- **Regression:** 35 focused kernel tests include signed spacing, blind/unsupported chain refusal and unchanged Fill/Path scope. The original one-rectangle browser case also passes, including an independent diagonal collision. This is not closure of the broader #25.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prior-circular-*,prior-path-cut-pattern}.test.mjs
D1908_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome \
  node apps/cad-studio/test/prior-circular-rectangular-cut-pattern-browser.mjs /tmp/cad-grid-proof --mixed
```

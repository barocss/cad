# D1635 — Exact Thicken for an authored semicylinder

P5, row 08, [#11](https://github.com/barocss/cad/issues/11) and [#368](https://github.com/barocss/cad/issues/368). Base `e14176cc20e82ec03e191b4c6dd68fd5c983a36a`.

Exact cylinder Thicken admits an open upright 180° patch with two certified coaxial quarter spans. The five U poles have canonical quarter weights and one double internal knot. The kernel checks the shared center, equal radii, consistent traversal, opposite endpoints and common Z translation on the stored coordinates. Unequal positive span widths remain valid. The native solid has one face per cylindrical skin, two separate coplanar radial walls and two caps. The internal span join adds no edge or face. Make curves retains the five poles and weights when it converts a representable open XY semicircle from the sketch.

- **PASS, baseline reproduction.** The base kernel rejects the five-pole source with `CAPABILITY`.
- **PASS, affected checks.** Kernel 16/16 and Model 26/26. The rotated native fixture verifies unequal span widths, U and V reversal, side selection, both radial wall normals, independent volume and center of mass. Wrong seam knots, a folded or displaced span, wrong weights, a skew axis and axis collapse are refused. Model checks both signed sketch semicircles through Duplicate, Move, Ruled and exact Thicken. Both package type checks, scoped ESLint, generated agent tools check, browser syntax, Studio build and Git diff pass.
- **PASS, desktop Studio WebGPU.** Draw a 180° Centre arc with center (20, 20), start (30, 20) and end (10, 20). Use Make curves, Duplicate, Move ΔZ 12 mm and Ruled surface. Both authored rails and the patch retain the canonical coefficients. Reverse at 10 mm refuses axis collapse and preserves the input. Apply at 2 mm, edit to 3 mm, Save and fresh Open. Review the actual sketch, preview and reopened solid. Studio checked 1,162 files with zero changes, page errors and console errors.
- **PASS, independent native measurements.** The named closed solid has genus 0, 8 vertices, 12 edges and 6 faces. Outer radius remains 10 mm. Inner radius is 8 then 7 mm. Studio and native volumes agree with 216π and 306π mm³ within 1e−7 mm³. Native volumes are 678.584013175393 and 961.3273519984747 mm³. Fresh Open reproduces the digest `9732554b3b282e7faf5e6b846575245aa44096813a6bb2006cf7a72cce0518a0`.
- **FAIL.** Zero failures in the final checks.
- **NOT_RUN.** Full local suites, WebGL2, tilted axes, trimmed patches, other multi-span sweeps and paid live models. The linked issues remain open.

Use Node 22.19.0, installed desktop Playwright and Chrome, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/api-thicken.test.mjs
pnpm --dir packages/barocss-cad-model test sketch-arc-canonical-source api-thicken agent-direct-thicken toolset
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/exact-cylinder-thicken-browser.mjs
pnpm --dir apps/cad-studio build
D1635_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-thicken-browser.mjs "$OUT" --semicircle
git diff --check
```

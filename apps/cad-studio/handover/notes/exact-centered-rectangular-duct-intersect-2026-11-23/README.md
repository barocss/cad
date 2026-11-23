# D1765 — Bind the native joints on a centered rectangular duct Intersect

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `cc77718ee80ff8e1433758e9c62131a33c088312`.

Retain one half of the exact R20 duct from [D1762](../exact-closed-rectangular-duct-2026-11-23/README.md) with a box through x = 0. Verify the existing eight walls and two caps. Bind native planar and cylinder charts to their exact boundaries. Keep the existing 3D geometry and topology.

- **FAIL, original continuity.** Actual Studio produces one strict-valid shell with both cap apertures. The original native result has zero pcurves on 48 coedges. All 24 native measurements return `missing-pcurve`. The volume is 1,005.3096491487297 mm³.
- **PASS, desktop Studio WebGPU.** Measure one circular corner and the inner and outer rims on both caps. The native measurements return 90° with eight samples each. Select both cap faces in Left view. The material rays hit the x = 0 planes. The cavity rays pass through each opening and hit behind that plane. Edit cavity height from 4 to 2 mm. Undo, Redo, Save and fresh Open preserve the revised cut. Restore the initial height after Open. An explicit local Agent approval produces the same native B-rep as direct Intersect.
- **PASS, native proof.** All 48 charts and 24 measurements pass. One closed genus-one shell holds 10 faces, 12 loops, 24 edges and 16 vertices. Both caps have four straight exterior edges and four straight interior edges with opposite signed winding. The captured face geometry, edge coordinates, topology, mass and quadrature match the original stitched result exactly. The maximum chart gap after editing is 2.865e−14 mm. Nine earlier native disk, offset and annular outputs remain byte-identical. Tests cover both opening windings, upstream width and cavity changes, and swapped operands.
- **PASS, affected checks.** 53 kernel, 21 Model and 12 Studio tests, kernel library build, kernel types, scoped ESLint, Studio production build and types, browser syntax and Git diff check. Two Studio runs record 16 checkpoints with zero source, page or console errors.
- **FAIL, inherited.** Aggregate kernel code-shape reports unchanged spread min/max counts in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** The desktop outline retains tessellation segments. General Rendering remains held in #608.
- **NOT_RUN.** Full local suites, arbitrary planes, offset rectangular cuts, follow-on Fillet, exchange, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #10 stays open.

| Cavity | Native volume | Native B-rep digest |
| --- | --- | --- |
| 2 × 4 mm | 1,005.3096491487297 mm³ | `23fb00e9964c72e44c7da5e3cc30de1c7cfc2e1b1c36f1dc8e7f775fa5c4b4a3` |
| 2 × 2 mm | 1,256.637061435914 mm³ | `f44382eed045d984d84cace5da81dce44842d4548909a631873e7e16f58b6a9f` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1765_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --observe-base
D1765_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad build:library
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-duct-intersect,exact-annular-ring-intersect,exact-ring-intersect,exact-offset-ring-intersect,exact-closed-circle-sweep,analytic-boolean,boolean-face-sources,edge-continuity}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity native-continuity-tool sweep-history-edit boolean-mode-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope continuity-location sweep-path-geometry
pnpm exec eslint apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
git diff --check
```

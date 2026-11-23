# D1767 — Bind native joints on an offset rectangular duct Intersect

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `b118a3c9c69c8a3e9b16ec7c82b538d3a8cd3ab6`.

Qualify the positive-offset, fully covering box clip on the D1762 default-frame closed rectangular duct. Certify the stitched circular coefficients and rectangular cap boundaries. Bind both native charts per 3D edge. The existing centered result and other ring cases retain their exact output.

- **FAIL, original continuity.** A Studio box at x = 1 mm produces one strict-valid result, both rectangular apertures and 973.29611477584 mm³. The original result has zero bindings across 48 coedges and zero native angles across 24 edges. Studio reports a missing native parameter curve.
- **PASS, desktop Studio WebGPU.** Measure native corner and cap joints at x = 1 mm. Select both planar caps and test material and cavity rays. Edit the box from x = 1 to x = 2 mm and the cavity height from 4 to 2 mm. Undo, Redo, Save and fresh Open preserve both edits. Measure the new cap joints after Open and restore the original geometry through History. Explicit local Agent approval reproduces the direct x = 1 mm native digest.
- **PASS, native geometry.** One closed genus-one shell, 10 faces, 12 loops, 24 edges, 16 vertices and 48 charts. At x = 1 mm the eight vertical cap and cylinder joints measure 86.815261°, 87.270597°, 92.605251° or 93.016961°. The other sixteen joints measure 90°. Native signs match the independent cylinder normal formula. Segment-area integration and the cap loop measurements match the native result. The initial 3D geometry, topology, mass and quadrature match the original exactly. The maximum initial chart gap is 3.420e−14 mm. The native x = 15 mm control verifies the mixed single-span and two-span case.
- **PASS, affected checks.** 56 kernel, 21 Model and 12 Studio tests, kernel library build and types, scoped ESLint, Studio production build with types, driver syntax and Git diff check. Ten earlier kernel fingerprints and five centered desktop native records match byte for byte. Three passing desktop runs record 33 checkpoints with zero source, page or console errors.
- **FAIL, recovered fixtures.** The first Studio candidate incorrectly expected the Box creation receipt to survive its regular History edit. Compare authored geometry fields after that edit. The native x = 15 fixture also corrected the expected number of one-span corner arcs from eight to six.
- **FAIL, inherited.** Aggregate kernel code-shape reports unchanged spread min/max counts in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** The desktop outline retains tessellation segments. General Rendering remains held in #608.
- **NOT_RUN.** Full local suites, arbitrary cut directions, negative or tangent offsets as newly accepted geometry, follow-on Fillet, exchange, alternate GPU backends, mobile and live providers. Issue #10 stays open. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

| Cut plane | Cavity | Native volume | Native B-rep digest |
| --- | --- | --- | --- |
| x = 1 mm | 2 × 4 mm | 973.29611477584 mm³ | `8b3e9b605bc365439a7aaa655f3430d2ee475a02175f29b179a6b51d76ac5b5e` |
| x = 2 mm | 2 × 4 mm | 941.200994319684 mm³ | `e4cbae329e6bb7c5a3fb66d7daf6717a4b250485a9ace15e710ba7a65acc75b5` |
| x = 2 mm | 2 × 2 mm | 1,176.5015513692315 mm³ | `a7d08d978db1ef925987e759ab336d437d553a2d02da98b9a803c07b4edb79b7` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first command on the base with the candidate driver.

```sh
D1767_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --offset --observe-base
D1767_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/candidate" --offset
D1765_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/centered"
pnpm --dir packages/barocss-cad build:library
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-duct-intersect,exact-ring-intersect,exact-annular-ring-intersect,exact-offset-ring-intersect,exact-closed-circle-sweep,analytic-boolean,boolean-face-sources,edge-continuity}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity native-continuity-tool sweep-history-edit boolean-mode-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope continuity-location sweep-path-geometry
pnpm exec eslint apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
git diff --check
```

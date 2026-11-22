# D1755 — Retain native charts on a centered annular ring Intersect

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `51a3048b118604228613841d63faa3dccb89b753`.

Certify the outward and inward toroidal shells, their common axis and center, and a single transverse box face through that axis. Rebind the existing Boolean result's native supports, seams and annular cap rims. Accept the exact rational charts only if the repaired result passes strict checks. The bounded reader admits bore starts on the radial profile axis and both bore windings.

- **FAIL, original continuity.** Desktop Studio creates the correct two-holed result. Zero of its 40 coedges have native parameter curves. All 20 native measurements report `missing-pcurve` and the Studio inspector gives the same reason.
- **PASS, desktop Studio WebGPU.** Intersect an R20 Exact Sweep with outside Ø4 and bore Ø2 mm. Select both annular cap faces. A ray on each cap hits material at the cut plane. A ray through each hole hits farther inside the model. All 20 native measurements return eight samples each. The 12 seams read 0° and the eight cap rims read 90°. Edit the source to Ø6, Undo, Redo, Save and fresh Open. The two holes and all measurements persist. Restore Ø4 from reopened History. Explicit local Agent approval reproduces the same native result as direct Intersect and refuses a stale revision.
- **PASS, native geometry.** One closed genus-one material shell, 10 faces, 12 loops, 20 edges, 12 vertices and 40 native pcurves. Both caps have two rational outer and two rational inner half-arcs with opposing loop winding. At Ø4 the maximum measured seam angle is 3.48e−13° and chart gap is 5.39e−15 mm. Independent volume and centroid checks match the native quadrature and Studio worker. Kernel tests include 0°, 29° and 90° rail starts, two bore windings, a radial start reversal, swapped Boolean operands, ID and OD edits, native roundtrip and three negative quarter-knot checks.
- **PASS, affected checks.** 19 kernel, 21 Model and 12 Studio tests. Full kernel library build and kernel types, scoped ESLint, Studio types and build, browser driver syntax and Git diff check. Five centered and offset disk B-rep and mass digests are byte-identical. Existing aligned centered and offset desktop controls also match the D1677 and D1680 recorded volumes. The four runs record 58 Studio checkpoints with zero source, page or console errors.
- **FAIL, recovered fixture.** The first new test used a parameter expression outside the existing schema. The final fixture uses the supported single-parameter reference.
- **FAIL, inherited.** Aggregate kernel code-shape guard reports eight counts in the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files.
- **NOT_RUN.** Full local suites, WebGL2, new chart admission for offset annular cuts or phased bores, arbitrary clipping, follow-on Fillet, exchange, mobile and live providers. Offset annular and phased bore controls retain the valid generic result. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #10 stays open.

| Outside diameter | Volume | Native B-rep digest |
| --- | --- | --- |
| 4 mm | 592.176264044366 mm³ | `68a6ea1b311f4ee6b8e62e2ffde298d1dbc308285e7cf2fb00e7e1776d462f24` |
| 6 mm | 1,579.1367041218089 mm³ | `2c1f15a895342fd8910fae2deed045f3927214685b799c31842b9628fa07f37b` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate browser driver.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-annular-ring-intersect,exact-ring-intersect,exact-offset-ring-intersect,exact-closed-circle-sweep}.test.mjs
pnpm --dir packages/barocss-cad lint
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity native-continuity-tool sweep-history-edit boolean-mode-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope continuity-location sweep-path-geometry
pnpm exec eslint apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs
D1755_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/base" --annular --expect-missing-binding
D1755_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/annular" --annular --local-approval
D1677_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/control-centered"
D1680_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/control-offset" --offset
git diff --check
```

# D1776 — Bind native joints on an offset two-cavity duct Intersect

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `f73816f84ca9f33b656d413aa19a69152a36acff`.

Use the existing offset chart binder for the closed paired-cavity Sweep. The box retains x ≥ offset while its other faces stay clear. The offset stays strictly inside the innermost circular orbit. Keep the analytic Boolean's 3D geometry, topology, IDs and face sources.

- **FAIL, original continuity.** Studio at x = 1 mm produces a strict-valid cut with four apertures and 1,946.592280376439 mm³ of material. The cut has zero parameter curves and no measurable native angle across 36 edges.
- **PASS, actual desktop Studio WebGPU.** Measure the curved corner and all cap rim groups. Both planar cap selections and four aperture rays identify the two openings on each cap. Move the cutter from x = 1 to x = 2 mm. Undo and Redo preserve the clip edit. Reduce one cavity height from 2 mm to 1 mm. Undo, Redo, Save and fresh Open preserve the edit. Measure the rim groups and verify both apertures per cap after Open. Restore the initial native digest through History. The local Agent dry run preserves source bytes. Explicit Studio approval reproduces the initial direct cut.
- **PASS, independent geometry.** One closed genus-two shell with 14 faces, 18 loops, 36 edges, 24 vertices and 72 native charts. Segment-area and first-moment integrals agree with native material volume and centroid. At x = 1 mm, the twelve vertical cap and cylinder joints measure 86.815261°, 87.270597°, 92.605251° or 93.016961°. The other 24 joints measure 90°. Maximum Studio chart gap is 3.421e−14 mm. The native x = 15 mm control covers ten one-span arcs and two two-span arcs. An extra active box face, a tangent plane and altered rational poles fail the native chart certificate.
- **PASS, controls.** The initial Studio geometry, topology and mass match the baseline. The kernel result retains the raw Boolean 3D data and traced face sources. Twenty-four prior kernel fingerprints and eleven earlier desktop native records match byte for byte.
- **PASS, affected checks.** 65 kernel, 24 Model and 24 Studio tests. Kernel build and types, scoped ESLint, Studio build with types, driver syntax and Git diff check. 49 desktop checkpoints record zero source, page or console errors.
- **FAIL, inherited.** Aggregate kernel code-shape reports the same findings in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** The desktop curved outline retains tessellation segments. General Rendering remains held in #608.
- **NOT_RUN.** Full local suites, paired positive-offset Agent image review, other cutters, follow-on Fillet, exchange, alternate GPU backends, mobile and live providers. Issue #10 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Cut plane | Cavity heights | Native volume | Native B-rep SHA-256 |
| --- | --- | --- | --- |
| x = 1 mm | 2 and 2 mm | 1,946.5922803764392 mm³ | `8d28196c3cf3fb19803e933be75e331f8e91d84e25e35c06266f7de6213a6132` |
| x = 2 mm | 2 and 2 mm | 1,882.4023999322035 mm³ | `7c18137306e11b4cc9c69c462224e9e6c8d479d5170c54cf87a34e09dd6e69b2` |
| x = 2 mm | 1 and 2 mm | 2,000.0526784569752 mm³ | `912f9c768c67e54486519b4f79236fae1699c164f2e4b32c6a3c7edf69fa1c8b` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1776_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --paired-cavities --offset --observe-base
D1776_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/verified" --paired-cavities --offset
D1773_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/paired-centered-control" --paired-cavities
D1767_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/single-offset-control" --offset
pnpm --dir packages/barocss-cad build:library
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-paired-rectangular-duct-intersect,exact-rectangular-duct-intersect,exact-ring-intersect,exact-annular-ring-intersect,exact-offset-ring-intersect,exact-closed-circle-sweep,analytic-boolean,boolean-face-sources,edge-continuity}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity native-continuity-tool sweep-history-edit boolean-mode-history rectangular-duct-intersection-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope continuity-location sweep-path-geometry proposal-review-availability
pnpm exec eslint packages/barocss-cad/{src/brep/exact-rectangular-duct-intersect.ts,test/exact-paired-rectangular-duct-intersect.test.mjs} apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
git diff --check
```

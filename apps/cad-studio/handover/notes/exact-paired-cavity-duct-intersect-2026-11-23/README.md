# D1773 — Bind native joints on the centered two-cavity duct Intersect

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `21705a14cf671592021c670a4658d91cbc5ae992`.

Extend the existing rectangular duct Intersect chart binding to the D1770 paired-cavity Sweep and a centered covering box. Verify one exterior shell and two axially separate inward source shells. Match each cap aperture to its source interval and each wall to its radius, axial bounds and orientation. Bind both native charts per result edge. Keep the raw Boolean 3D geometry, topology, IDs, face ownership and face source records.

- **FAIL, original continuity.** Actual Studio creates a strict-valid 2,010.619298297472 mm³ cut. It has zero bindings across 72 coedges and zero native angles across 36 edges. The continuity panel reports a missing native parameter curve.
- **PASS, actual desktop Studio WebGPU.** The plane picks resolve to `n3.side3#1` and `n3.side3#2`. Four cavity rays verify two apertures per cap. The continuity panel measures a curved corner and the three rim loops per cap with native samples. Reduce the first cavity height from 2 mm to 1 mm. Undo, Redo, Save and fresh Open reproduce the edited cut. Repeat the cap ray and native continuity checks after Open. Restore the original native digest from History. A local Agent dry run preserves the source bytes. The explicit Studio approval gives the same native B-rep as the direct command.
- **PASS, independent native geometry.** One closed shell, genus two, 14 faces, 18 loops, 36 edges, 24 vertices and 72 charts. Each cap has a 4 × 10 mm exterior and two 2 × 2 mm apertures before editing. The web is 2 mm and the material area is 32 mm² per cap. All 36 native angles are 90°. A half-annulus integral gives 640π mm³ before the edit and 680π mm³ after it. The edit shifts the world Z centroid to +2/17 mm. The maximum Studio chart gap is 2.864e−14 mm. The initial Studio mass and 3D geometry match the baseline exactly.
- **PASS, controls.** Reversed travel, reordered cavities, swapped operands, repeated radius ownership and one independent height edit pass in native fixtures. Missing source charts, altered inward orientation, a duplicated aperture and box planes outside the bounded centered case are refused by the chart binder. Sixteen prior single-cavity kernel fingerprints and eleven prior desktop native records match byte for byte.
- **PASS, affected checks.** 62 kernel, 23 Model and 24 Studio tests. Kernel library build and types, scoped ESLint, Studio build with types, driver syntax and Git diff check. 47 desktop checkpoints have zero source, page or console errors.
- **FAIL, inherited.** Aggregate kernel code-shape reports unchanged spread min/max findings in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** The desktop curved outline retains tessellation segments. General Rendering remains held in #608.
- **NOT_RUN.** Full local suites, a paired positive-offset chart certificate, other cutters, follow-on Fillet, paired cut image review, exchange, alternate GPU backends, mobile and live providers. Issue #10 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Cavity heights | Native volume | Native B-rep SHA-256 |
| --- | --- | --- |
| 2 and 2 mm | 2,010.6192982974717 mm³ | `6f4b9363ead21fbb8c449f26d6a6ed2538f05fc7808ab43bfa6f9a53d6d78018` |
| 1 and 2 mm | 2,136.283004441062 mm³ | `a9faaf1021667fefdba8df1ddd16592407d4a337140eedd72f3476b90fb83817` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1773_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --paired-cavities --observe-base
D1773_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/verified" --paired-cavities
D1765_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/centered-control"
D1767_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/offset-control" --offset
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

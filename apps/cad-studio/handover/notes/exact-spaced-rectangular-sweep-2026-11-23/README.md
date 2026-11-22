# D1732 — Sweep an aligned solid rectangle through spaced same-turn bends

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `7d4ff1af7ed91bbeb3f7bc45e72b3b3f08e18df5`.

Use a solid rectangle aligned to the radial and binormal axes. Carry it through the R12/R18 same-turn quarter bends and 8 mm straight span. The existing exact revolve and prism builders generate the walls and planar caps. Rebind the shared edges on their affine bend planes and native cylinder or prism chart boundaries.

## Verification

- **FAIL, base capability.** Desktop Studio opens the valid path and aligned 4 × 6 mm sketch. Exact Sweep refuses the rectangular section, disables Apply and preserves the source.
- **PASS, desktop Studio WebGPU.** Preview and Apply the aligned section. Refuse width 24 mm at the first bend axis and resize width 4→8 mm. Undo, Redo, Save, fresh Open and a second width edit pass. Studio measures 0° on all eight native joint edges. The local Agent rejects a stale path revision, previews without a model write and reproduces the manual body after explicit approval. Twelve checkpoints report zero source changes, page errors and console errors. The current display shows arc tessellation.
- **PASS, native geometry and mass.** One strict genus-zero solid has 14 faces, 14 loops, 28 edges and 16 vertices. Both planar end caps keep four straight sides. Each junction binds four straight edges to two native charts, with two plane-to-plane and two cylinder-to-plane wall joins. Plane curvature difference is zero. The cylindrical joints match the reciprocal bend-wall radius. Independent analytic volume, centroid and inertia pass. Disjoint tangent slabs retain clearance from both bend axes. The maximum native pcurve gap is 7.33e-15 mm and the maximum measured angle is 1.80e-14°. The touching rectangular and spaced annular desktop controls pass.
- **PASS, affected checks.** 39 kernel, 8 Model and 9 Studio tests, kernel build:fast, kernel and Model types, scoped ESLint, Studio production build and types, driver syntax, and Git diff check.
- **FAIL, recovered test setup.** The first focused native run found fixture errors in the profile kind and sampling outside affine face trims. The corrected tests use a polygon and native trim boundaries.
- **NOT_RUN.** Full local suites, full kernel build, fitted paths, hollow spaced rectangles and additional profile families, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 remains open.

| Width × height (mm) | Independent volume (mm³) | Native volume (mm³) | Independent centroid (mm) |
| --- | ---: | ---: | --- |
| 4 × 6 | 1322.9733552923253 | 1322.9733552923253 | [7.2023339569, 19.9492697743, 0] |
| 8 × 6 | 2645.9467105846506 | 2645.9467105846497 | [7.3474615963, 19.9492697743, 0] |

The reopened 8 × 6 native hash is `45551948b95454b790bbeefe6306be29e59353bd598d4f13d56d00008f63d53d`. The original and restored 4 × 6 native hash is `8dc71bef0ebe78a374be623d3e155d0c1276aa820b49f9249e0c3b0cd9674c4b`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-arc-line-arc-sweep,exact-arc-line-arc-sweep,exact-rectangular-opposite-arc-sweep}.test.mjs
D1732_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/rectangular" --spaced
D1709_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/touching-rectangle" --same-turn
D1729_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/annular" --same-turn --annular
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-arc-line-arc-sweep,exact-rectangular-arc-line-arc-sweep}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model exec eslint src/engine/errors.ts src/chat/part/features.ts
pnpm exec eslint apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs
git diff --check
```

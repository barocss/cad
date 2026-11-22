# D1733 — Carry a centered rectangular opening through spaced same-turn bends

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `576e35ad9ae75c6579961426e77224172ec7b40e`.

Carry one centered, aligned rectangular aperture through the D1732 R12/R18 same-turn quarter bends and 8 mm straight span. The straight prism retains the same opening as both revolved bends. Check wall separation before each glue and bind inner and outer walls by their native chart ownership.

## Verification

- **FAIL, base capability.** Studio displays the path and rectangular profile with an aperture. Exact Sweep requires a solid rectangle, keeps Apply disabled and preserves the source.
- **PASS, desktop Studio WebGPU.** Build a 4 × 6 mm outer section with a 2 × 4 mm opening. Reject an eccentric aperture and keep the accepted solid. Edit the opening to 2 × 2 mm. The 12 outer surface charts and original join IDs match. Undo, Redo, Save, fresh Open and the original aperture restoration pass. Both center rays enter the reopened mouth and adjacent rays hit the cap lands. Study measures 0° on all 16 native edges, including after fresh Open. The local Agent stages the correct revision, refuses stale and direct approval, and reproduces the original native body after explicit Studio approval. Sixteen checkpoints have zero source changes, page errors or console errors.
- **PASS, native geometry.** One strict genus-one solid has 26 faces, 28 loops, 56 edges and 32 vertices. Both planar caps have one outer and one inner loop. Each station has eight reciprocal pcurve pairs. The four plane joins have zero curvature difference at each station. The other joins match the signed bend-wall curvature in the native tests. Native volume, centroid and central inertia match independent integration. The axis, opening orientation, concentricity and wall clearance guards remain active. The maximum pcurve gap is 7.95e-15 mm and the maximum native angle is 1.67e-14°.
- **PASS, affected checks.** 118 kernel, 8 Model and 9 Studio tests. Kernel build:fast, kernel and Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check. Retained desktop controls cover the solid spaced rectangle and the prior direct two-arc duct.
- **FAIL, recovered test setup.** The first new focused test run found a local variable naming collision. Corrected and reran all 118.
- **FAIL, inherited aggregate lint.** ESLint passes. Code shape still reports the unchanged cylindrical-bore.ts (3), thicken-cylinder.ts (3) and thicken-planar.ts (2) excess.
- **NOT_RUN.** Full local suites, full kernel build, arbitrary profiles and fitted frames, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 remains open.

| Opening (mm) | Independent volume (mm³) | Native volume (mm³) | Independent centroid (mm) |
| --- | ---: | ---: | --- |
| 2 × 4 | 881.9822368615503 | 881.9822368615505 | [7.2204749119, 19.9492697743, 0] |
| 2 × 2 | 1102.477796076938 | 1102.4777960769377 | [7.2095903389, 19.9492697743, 0] |

The reopened 2 × 2 native hash is `83175c9ccd6a53c54e5e6c64cc037ef2bcc08a3bbbd50a59bff28d3dbcc0db85`. The original and restored 2 × 4 native hash is `2b401730a433095ffd0f46e2193f0103122e78c277b53919289cc05c9e375dce`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec tsc -p tsconfig.json
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-arc-line-arc-sweep,exact-arc-line-arc-sweep,exact-rectangular-opposite-arc-sweep,exact-rectangular-opposite-arc-duct-sweep,exact-opposite-arc-sweep,exact-rectangular-duct-sweep,exact-rectangular-elbow-sweep,exact-tangent-sweep,exact-elbow-sweep,exact-arc-sweep,exact-closed-circle-sweep,exact-straight-sweep,sweep-solid,sweep-mass-overlap}.test.mjs
D1733_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/duct" --spaced
D1713_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/touching-duct" --same-turn
D1732_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/solid-control" --spaced
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-rectangular-arc-line-arc-sweep.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model exec eslint src/engine/errors.ts src/chat/part/features.ts
pnpm exec eslint apps/cad-studio/test/{exact-rectangular-duct-sweep,exact-rectangular-s-bend}-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
git diff --check
```

# D1680 — Measure non-circular cut rims on an offset Exact Sweep ring

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `d4b628b706acd516ef388648c8f19258d6296ca1`

When one axis-parallel box face clips the Exact circular ring away from its axis, two non-circular planar rims bound the retained original torus. Qualify the original rational supports, box clearance, the single retained angular interval on each chart, two disjoint cap loops and the original Boolean ownership. Build each fitted space curve and its torus parameter map with a shared C1 cubic parameter. Derive the planar chart from the same space curve and retain the exact original seam curves. Check sampled position and tangent residuals, full rim coverage and strict topology before using the repaired result. Outside the qualified branch, keep the accepted generic intersection.

- **FAIL, base.** Desktop Studio created and selected both caps at x = 1 mm on the 29° rail with Ø4 tube. The native Boolean result was a strict solid, with only 3.43e-08 mm³ volume error against the independent integral. It had zero parameter curves. Both cut rims and a bend seam refused measurement in Studio. The sampled rim residual against the torus was 1.43e-06 mm.
- **PASS, native geometry.** The seven standalone cases span both offsets, tube radii and rail orientations. Each has one strict closed genus-zero solid, 6 faces, 70 edges and 140 parameter curves. All 70 joints are measurable with eight samples each. Across the native probes the maximum strict UV position residual is 3.23e-14 mm, torus or plane rim residual is 5.45e-10 mm, sampled cut-angle error is 2.54e-10° and original seam angle is within 2.04e-13° of zero. The tangent inner limit retains the generic result and has no new chart proof.
- **PASS, actual desktop Studio WebGPU.** On both orientations create the box, Intersect, select both caps, measure each cap rim and the original bend seam, edit Corner X 1→2 mm and tube diameter 4→6 mm, then Undo, Redo, Save and fresh Open. The reopened result retains its native digest and the cut edits again to 1 mm from the reopened History. The largest sampled Studio rim residual is 1.01e-10 mm against the torus and 0.00e+00 mm against the plane. Native and Studio volumes agree with the independent integral within 8e-08 mm³. The existing centered rail control matches all D1677 native digests, volumes and topology.
- **PASS, local Agent path.** The 29° fixture refuses a stale revision. A valid dry run leaves the original file unchanged. Explicit Studio approval produces the same native digest as direct Intersect.
- **PASS, affected checks.** Kernel 48, Model 11 and Studio 12 tests. Kernel build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check pass. The offset-oblique, offset-aligned and centered desktop runs record 18, 16 and 11 captures respectively, with zero source changes or page and console errors.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same findings as base in `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts`.
- **NOT_RUN.** Full local suites, WebGL2, arbitrary inclined cutters, general multi-face clipping, downstream Fillet on the fitted rims, and the live provider. Keep #10 open.

With cutting-plane distance d, the independent section uses torus radial coordinate ρ and ordinate y = ±√(ρ² − d²). Native face-normal angles are checked against acos(−d(ρ − R)/(ρr)). The volume integrates the retained azimuth 2 acos(d/ρ) over the tube disk with Jacobian ρ. The test checks each planar rim width against the analytical extent and confirms it differs from the tube diameter.

| Rail | Stage | Offset (mm) | Tube diameter (mm) | Native volume (mm³) | Independent volume (mm³) |
| --- | --- | --- | --- | --- | --- |
| 29° | intersected | 1 | 4 | 764.425047607773 | 764.425047583582 |
| 29° | offset-two | 2 | 4 | 739.218071239567 | 739.218071259266 |
| 29° | diameter-six | 2 | 6 | 1663.238815843453 | 1663.238815788092 |
| 29° | reopened | 2 | 6 | 1663.238815843453 | 1663.238815788092 |
| 29° | offset-edited-after-open | 1 | 6 | 1719.956129149912 | 1719.956129170304 |
| aligned | intersected | 1 | 4 | 764.425047579397 | 764.425047583582 |
| aligned | offset-two | 2 | 4 | 739.218071261560 | 739.218071259266 |
| aligned | diameter-six | 2 | 6 | 1663.238815822681 | 1663.238815788092 |
| aligned | reopened | 2 | 6 | 1663.238815822681 | 1663.238815788092 |
| aligned | offset-edited-after-open | 1 | 6 | 1719.956129248246 | 1719.956129170304 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git. The baseline uses `--offset --oblique --expect-missing-binding` on the base kernel.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/{analytic-boolean,exact-ring-intersect,offset-ring-trim}.ts test/exact-ring-intersect.test.mjs test/exact-offset-ring-intersect.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-offset-ring-intersect,exact-ring-intersect,exact-half-ring-fillet,exact-closed-circle-sweep,edge-continuity,analytic-boolean,boolean-face-sources,freeform,arc-sweep-bore-fillet}.test.mjs
pnpm exec eslint apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs
node --check apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display half-ring-fillet-reference
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1680_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/offset-oblique" --offset --oblique --local-approval
D1680_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/offset-aligned" --offset
D1677_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-intersection-browser.mjs "$OUT/centered-control" --oblique
git diff --check
```

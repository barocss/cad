# D1729 — Carry a concentric bore through the spaced same-turn Sweep

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `015900a19570c3d39bf04353dc39cef6292bce79`.

Use the existing annular Sweep builder on the D1725 same-turn arc–line–arc path. The profile has one circular outer boundary and one concentric circular hole. Its two bends and straight span retain the same tangent-plane separation as the disk profile. The existing wall-clearance, native chart binding and topology checks apply to both turns.

## Verification

- **FAIL, base capability.** Studio displays the R12/R18 same-turn quarter circles, 8 mm straight span and concentric annular sketch. Exact Sweep requires a circular disk and keeps Apply disabled. The source remains unchanged.
- **PASS, desktop Studio WebGPU.** An Exact Sweep with Ø4 outer diameter and Ø2 bore previews and applies. The kinked path and bore wall contact are refused. Edit the bore to Ø3, then Undo, Redo, Save and open in a fresh context. Each of the eight native joint edges displays 0°. Both openings pass the center-ray check in Front view. The rim rays land on Y0 and Y−6 mm, while the aperture rays reach the interior at Y6.164825 and Y1.495447 mm. Restoring the Ø2 bore after Open reproduces the original B-rep hash. Fifteen checkpoints have no source changes, page errors or console errors.
- **PASS, native geometry and mass.** The strict genus-1 solid has 14 faces, 16 loops, 28 edges and 16 vertices. Both annular caps retain their inner loops. The eight rational half-circles have reciprocal pcurves and tangent wall normals. The maximum measured pcurve gap is `1.79e-15 mm`. Topology IDs and outer wall charts stay fixed during a bore edit. Independent analytic volume, centroid and inertia match native results. Oblique 30°/120° limit cases and a 0.00011 mm straight span pass. Nonconcentric, touching, multiple and unsupported hole profiles retain their refusal.
- **PASS, local MCP.** Discover the optional concentric bore, refuse the stale curve revision, dry run and Preview without a model write, and explicitly accept in Studio. The approved native body matches the manual result.
- **PASS, affected checks.** 38 kernel, 8 Model and 9 Studio tests. Kernel build:fast, kernel and Model types, scoped ESLint, Studio production build and types, driver syntax, and Git diff check. The D1725 same-turn disk and D1723 opposite-turn annulus desktop controls retain the earlier native bodies.
- **NOT_RUN.** Full local suites, full kernel build, downstream finish composition, arbitrary profiles and frames, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 remains open.

| Bore (mm) | Radial wall (mm) | Independent volume (mm³) | Native volume (mm³) |
| ---: | ---: | ---: | ---: |
| 2 | 1 | 519.5304217351761 | 519.5304217351761 |
| 3 | 0.5 | 303.0594126788527 | 303.05941267885237 |

The original and restored Ø2 B-rep hash is `a6648884450e1ea8fad83e96a09268f41d137f15ac5cfeb1be44cf514e2139f1`. The edited and reopened Ø3 hash is `bec23ef27e3d71a8f336ce8c84ef052c2842cd5e900e7823edd7cf7c5c779466`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-line-arc-sweep,exact-opposite-arc-sweep}.test.mjs
D1729_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/annulus" --same-turn --annular
D1725_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/same-turn-disk" --same-turn
D1723_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/opposite-annulus" --annular
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-arc-line-arc-sweep.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model exec eslint src/engine/errors.ts src/chat/part/features.ts
pnpm exec eslint apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
git diff --check
```

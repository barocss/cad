# D1706 — Sweep a circular disk along same-turn tangent arcs

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `3b53bea529de9bc9774977009e8fd05a1385ac86`.

Carry a solid circular disk along two coplanar, tangent arcs with unequal radii that turn in the same direction. Each arc turns 30°–120°. Transport the section across the tangent join and keep the second axis on the same local radial side. The existing cap-plane separation, strict solid check and two native half-circle chart bindings apply at the joint. The disk must clear both bend axes. The original single-carrier path still handles arcs on one circle under its own total-angle limit.

## Verification

- **FAIL, base capability.** Studio joined the two valid 90° arcs with radii 12 and 18 mm. The Exact Sweep displayed the path-range refusal and disabled Apply. The joined document stayed identical.
- **FAIL, first test runs.** The first new faceted control used `mode: null`. It passes when the optional mode is omitted. An earlier broad run also found a changed diagnostic for an almost single-carrier path with out-of-plane error and an old assertion that refused the now-supported R20/R25 path. The final code retains the single-carrier fallback and its original diagnostic. The latter test now checks the exact body and independent volume.
- **PASS, native geometry.** One strict closed genus-zero solid has six faces, ten edges and six vertices. The two shared half-circle edges have matched native pcurves on both bends. Independent disk integration agrees with the closed-form and native mass, centroid and inertia. Tests cover the oblique alignment, 30°/120° and 120°/120° bounds, radius clearance, profile and path refusals, the faceted control and native reopening.
- **PASS, actual desktop Studio WebGPU.** Join the two same-turn arcs, refuse the kinked control, preview and apply the Ø4 mm sweep. Both native joins display 0°. A Ø24 mm edit reaches an axis and leaves the accepted document intact. Apply Ø6 mm, Undo, Redo, Save and open in a fresh context. The saved path and exact solid match the last accepted state. The maximum sampled section or surface error is `1.022e-14 mm`, pcurve gap `3.553e-15 mm`, join angle `1.826e-14°` and curvature difference error `8.327e-17 mm⁻¹`. The twelve checkpoints record zero source changes, page errors and console errors.
- **PASS, local MCP.** Discover the supported two-arc profile, refuse a stale path revision and dry-run on unchanged source bytes. Explicit Studio approval matches the direct Ø4 mm creation exactly.
- **PASS, affected checks.** 68 kernel, 15 Model and 13 Studio tests, kernel and Model types, scoped lint, production Studio build, driver syntax and Git diff check. Desktop controls for the annular circular and rectangular duct S-bends reproduce their earlier native hashes, volumes and topology through editing, approval and fresh Open.
- **FAIL, inherited.** Kernel lint's code-shape gate reports the same three unrelated files as [D1704](../exact-rectangular-s-bend-duct-2026-11-23/README.md). Scoped ESLint passed.
- **NOT_RUN.** Full local suites, docs aggregate with the D1704 discrepancies, WebGL2, mobile, paid model provider and additional same-turn profiles. First mechanical CAD remains 8/10 and overall completion is unmeasured. Issue #10 stays open.

The independent volume is `πr² × (12π/2 + 18π/2) mm³`. The cyan curve in the Studio scene marks the kinked path used for the refusal control.

| Studio stage | Diameter (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct apply and Agent approval | 4 | 592.1762640653614 | `6393289de36dd05af1245a6e31245b826b1832f94e934fecdd6d90a6c173a5d2` |
| Edited and fresh Open | 6 | 1332.3965941470626 | `68e093843e7486eb69b96f51be6b7fb48128191f3ad8a1992e849c61238b9347` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Pass `--same-turn --expect-refused` on the base.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-arc-sweep,exact-tangent-sweep,edge-continuity}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-opposite-arc-sweep,exact-arc-sweep}.test.mjs
pnpm --dir packages/barocss-cad lint
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display sweep-agent-remap tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-s-bend-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-s-bend-sweep-browser.mjs
D1706_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/verified" --same-turn
D1682_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/annular-control" --annular
D1704_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/rectangular-duct-control" --opposite-arcs
git diff --check
```

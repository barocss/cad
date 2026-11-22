# D1708 — Sweep a concentric bore along same-turn tangent arcs

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `16d5e1fd6e47522adcdf05c9ecee50c376f0681c`.

Carry a concentric circular hole through two coplanar, tangent, unequal-radius arcs that turn in the same direction. Use the existing annular section, parallel transport and native face gluing. Each arc turns 30°–120°. Require positive wall clearance and clearance from both bend axes. Each end has one planar cap with an outer loop and inner loop. Four shared native half-circle edges connect the two bends.

## Verification

- **FAIL, base capability.** The two valid tangent arcs joined in Studio. The same-turn Sweep required a circular disk and disabled Apply for the annular profile. The joined document stayed identical.
- **PASS, native geometry.** One strict closed genus-one solid has ten faces, twenty edges and twelve vertices. Each shared half-circle binds both native pcurves. Independent annulus quadrature checks volume, centre and inertia. The kernel cases cover different arc angles, rotated placement, eccentric and additional holes, wall contact, and positive wall clearance.
- **PASS, desktop Studio WebGPU.** Join two 90° arcs with radii 12 and 18 mm. Apply the Ø4 mm outer profile with a Ø2 mm bore. Refuse a kinked path and a wall-contact edit without changing the accepted document. Edit the bore to Ø3 mm. Check Undo and Redo, then save and open in a fresh context. Both centre rays pass the cap planes at the reopened mouths, and adjacent rays hit the cap lands. Edit back to Ø2 mm after opening. The 15 checkpoints record zero source changes, page errors and console errors. Maximum native gaps and sampled errors were `1.777e-15 mm` across pcurves, `3.331e-15 mm` at the caps, `8.882e-15 mm` on the toroidal surfaces and `2.221e-15 mm` at shared seams. Maximum tangent angle was `1.826e-14°`.
- **PASS, local MCP.** Discover the profile and path, refuse a stale path revision, and dry-run without changes to the source bytes. Studio approval creates the same native body as the direct Ø2 mm bore.
- **PASS, affected checks.** 74 kernel, 15 Model and 13 Studio tests. Kernel and Model types, scoped ESLint, Studio production build, driver syntax and Git diff check passed.
- **PASS, retained desktop controls.** The same-turn solid disk and the opposite-turn circular annulus reproduce the earlier native SHA-256, volume and topology at each measured step. Both controls reopen and approve without source changes, page errors or console errors. The first local control invocation stopped at the driver freeze assertion. The corrected invocation selects the established freeze variable for each control.
- **NOT_RUN.** Full local suites, WebGL2, mobile, a live model provider and broader same-turn profiles. D1706's inherited code-shape failure and D1704's aggregate documentation failure were not rerun. The first mechanical CAD baseline remains 8/10. Overall completion remains unmeasured.

Use the independent volume `π(rOuter² − rBore²) × (12π/2 + 18π/2) mm³`. The cyan curve in the Studio image is the kinked path for the refusal control.

| Studio stage | Bore diameter (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct apply, edit after Open and Agent approval | 2 | 444.1321980490211 | `d81343b29587414bb94e1ca96e30601186135ca346b13be9c95ff8110dd31e39` |
| Edited and fresh Open | 3 | 259.07711552859536 | `ac13bd2de8f0d595ea2a757fd5eeb5eeee17d9cf571f446dc9d37dba1192c8ef` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Pass `--same-turn --annular --expect-refused` on the base.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-arc-sweep,exact-tangent-sweep,edge-continuity}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-opposite-arc-sweep.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display sweep-agent-remap tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-s-bend-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-s-bend-sweep-browser.mjs
D1708_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/verified" --same-turn --annular
D1706_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/solid-control" --same-turn
D1682_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/opposite-annular-control" --annular
git diff --check
```

Issue #10 stays open for general path, section and frame support.

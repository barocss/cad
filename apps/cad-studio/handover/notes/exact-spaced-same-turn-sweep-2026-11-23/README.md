# D1725 — Sweep a circular disk through two same-turn bends with a straight span

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `1479564a711ce0a8ff87d8a6e8039448b82b77e8`.

Accept one circular disk on a rational quadratic arc–line–arc path with coplanar bends that turn in the same direction. The existing native builder creates the two toroidal bends, the straight cylinder, and the planar end caps. Use the existing tangent, angle, line length and bend-axis clearance limits. A same-turn path with a hole is still refused. The opposite-turn annulus stays supported.

## Verification

- **FAIL, base capability.** Desktop Studio reads the R12/R18 same-turn quarter circles and the 8 mm straight span, but Exact Sweep refuses the path. Apply is disabled and the document remains unchanged.
- **PASS, desktop Studio WebGPU.** Refuse the kinked control path. Preview and Apply the same-turn path. Refuse a diameter of 24 mm at axis contact, then change Ø4 to Ø6 through History. Undo, Redo, Save and fresh Open retain the feature and path. In the reopened file, change Ø6 back to Ø4 and recover the original B-rep hash. The approved revision-bound local Agent proposal produces the same authored nodes, outputs and native hash as the manual operation. An incorrect path revision is refused and dry run and Preview leave the accepted model unchanged. Twelve checkpoints show no page, console or frozen source failures. The opposite-turn annular control also passes its original desktop workflow.
- **PASS, native geometry and mass.** Strict genus-zero solid, two original planar caps and four rational quadratic shared edges. Both coedges on each joint bind to their native charts. The four continuity measurements round to 0° in Studio; their maximum raw angle is `7.33e-14°`. Maximum native pcurve gap is `3.56e-15 mm`. The independent disk-section integration checks volume, centroid and central inertia. The exact tangent projections separate both bends from the straight span outside the joint planes. Kernel controls cover oblique mixed 30°/120° arcs, equal radii with a positive straight span, previous opposite-turn sections, and refusal of same-turn holes, kinks, noncoplanarity and axis contact.
- **PASS, affected checks.** 57 kernel tests, 8 Model tests and 9 Studio tests. Kernel build:fast, kernel and Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check. The first native test run used an oblique straight span at the minimum length. Coordinate subtraction measured it below the limit. The final fixture uses 0.00011 mm and all 57 pass.
- **FAIL, inherited documentation aggregate.** The generated refusal reference differs from the sources, and API inventory IV001 reports 44 expected and 46 actual direct members. See [D1702](../pending-saved-chamfer-resize-review-2026-11-23/README.md).
- **NOT_RUN.** General fitted sweeps, guide frames, same-turn bores, other spaced profile families, WebGL2, mobile, full local suites and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 remains open.

| Diameter (mm) | Independent volume (mm³) | Native volume (mm³) | Independent centre (mm) |
| ---: | ---: | ---: | --- |
| 4 | 692.7072289802347 | 692.7072289802346 | [19.9492697743, 7.1902399870, 0] |
| 6 | 1558.591265205528 | 1558.5912652055276 | [19.9492697743, 7.2355923743, 0] |

The reopened Ø6 native hash is `3f36b40b5b59d8de488e5540e2f93340a0037c219758ed9947a36f30db75c100`. The original and restored Ø4 native hash is `5f46f402f576617528ad9230317557e806bd66e58f0c3b2e99f13bec58cedbc8`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-line-arc-sweep,exact-opposite-arc-sweep,exact-rectangular-opposite-arc-sweep,exact-rectangular-opposite-arc-duct-sweep}.test.mjs
D1725_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/same-turn" --same-turn
D1723_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/opposite-annulus" --annular
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-arc-line-arc-sweep.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model exec eslint src/engine/errors.ts src/chat/part/features.ts
pnpm exec eslint apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm --dir apps/library-docs check:docs
node --check apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
git diff --check
```

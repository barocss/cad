# D1713 — Sweep a rectangular duct along same-turn tangent arcs

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `c44245c96cf66b9a9bac90eae16ddc3581df204a`.

Carry one centered rectangular opening through a bend-aligned rectangle along two coplanar, tangent, unequal-radius arcs that turn in the same direction. Each arc turns 30°–120°. Reuse the existing rectangular duct geometry, native gluing and wall clearance check. Each end has a planar rim and one rectangular aperture.

## Verification

- **FAIL, base capability.** Studio refused a valid centered opening on the same-turn path, disabled Apply and kept the loaded document identical.
- **PASS, native geometry.** One strict genus-one solid has 18 faces, 20 loops, 40 edges and 24 vertices. The eight shared seam edges bind both native coedges. The cylindrical seams maintain the same curvature sign on each carrier. Both end faces retain inner and outer loops. Native tests check independent volume, centre and inertia, opposite winding and side tags, oblique placement, unequal radii, arc-angle limits, positive wall clearance and refusal near the gluer threshold, and bend-axis contact.
- **PASS, desktop Studio WebGPU.** Use an outer 4 × 6 mm section and R12/R18 quarter arcs. Apply the 2 × 4 mm aperture, inspect both mouths and measure 0° at all eight seams. Reject an eccentric opening without changing the accepted body. Edit the opening to 2 × 2 mm, use Undo and Redo, Save and open in a fresh context. Both center rays pass the reopened cap planes and adjacent rays hit the cap lands. The native section has at least 1 mm of wall before and after the edit. Restore 2 × 4 mm after Open and reproduce the original native hash. Maximum native pcurve gap is `8.882e-15 mm` and maximum measured angle is `1.903e-14°`. Thirteen checkpoints record zero source changes, page errors and console errors.
- **PASS, local MCP.** Discover the profile, reject a stale path revision, dry-run with unchanged source bytes and require Studio approval. The approved proposal reproduces the direct 2 × 4 mm aperture body.
- **PASS, affected checks.** Kernel build:fast, 90 kernel, 15 Model and 13 Studio tests, kernel and Model types, scoped ESLint, Studio production build and type check, driver syntax and Git diff check passed.
- **PASS, retained desktop controls.** The opposite-turn rectangular duct, same-turn solid rectangle and same-turn circular annulus match earlier native hashes, volumes and topology at every shared checkpoint.
- **NOT_RUN.** Full local suites, WebGL2, mobile, a live model provider and general sweep frames. The D1706 inherited code-shape failure and D1704 aggregate documentation failure were not rerun. First mechanical CAD remains 8/10. Overall completion is unmeasured. Issue #10 stays open.

Independent volume is `(24 − 2 × opening height) × (12π/2 + 18π/2) mm³`.

| Studio stage | Opening (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct apply, edit after Open and Agent approval | 2 × 4 | 753.9822368615503 | `1e8750cf90377c93e9602d6ed196228cbf3799429ddacdb8856b9e68fa4e742c` |
| Edited and fresh Open | 2 × 2 | 942.4777960769379 | `0651de9e29314c7ed947aca4af093153c560720cfe9ac52e9fba3f4044d1bd40` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Pass `--same-turn --expect-refused` on the base.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-arc-sweep,exact-tangent-sweep,edge-continuity}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display sweep-agent-remap tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
D1713_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/verified" --same-turn
D1704_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/opposite-control" --opposite-arcs
D1709_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/solid-control" --same-turn
D1708_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/annulus-control" --same-turn --annular
git diff --check
```

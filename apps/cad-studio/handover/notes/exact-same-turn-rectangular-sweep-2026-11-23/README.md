# D1709 — Sweep a solid rectangle along same-turn tangent arcs

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `6d641c5004afdae3f4cf93754cbea9ed6a2899d7`.

Carry a solid rectangle along two coplanar, tangent, unequal-radius arcs that turn in the same direction. Each arc turns 30°–120°. Set the section axes along the bend radius and perpendicular to the bend plane. Reuse the exact rectangular section builder, both circular carriers and four native join bindings. The two plane-wall joins maintain zero curvature difference. The two cylinder-wall joins have the same curvature sign on both carriers and a difference of `|1/r₁ − 1/r₂|`. Refuse a rectangle that reaches either bend axis or contains an inner loop.

## Verification

- **FAIL, base capability.** Studio joined both tangent arcs and refused the aligned solid rectangle with “The same-turn Sweep needs a circular outer section.” Apply stayed disabled and the joined document stayed identical.
- **PASS, native geometry.** One strict genus-zero solid has ten faces, ten loops, twenty edges and twelve vertices. It has two plane caps and four shared straight seams with reciprocal coedges and native pcurves. Both cylinders through each join retain their expected radii. Independent sectional integration checks volume, centroid and inertia against the closed form and native integration. Cases include standard and oblique frames, either smaller radius, limits of 30° and 120°, and binormal extent greater than both radii. Rolled sections, axis contact or crossing and rectangular or circular holes preserve the previous result on failure.
- **PASS, desktop Studio WebGPU.** Join R12 and R18 quarter arcs, preview and apply the 4 × 6 mm section, and measure 0° at each of the four native joins. The 24 mm width touches a bend axis and is refused without changing the accepted document. Apply 8 × 6 mm, Undo, Redo, Save and open in a fresh context. The new body matches its saved state. Edit the reopened width to 4 mm and use Undo and Redo again. The original body returns exactly. The maximum native pcurve gap is `7.325e-15 mm` and maximum measured join angle is `1.903e-14°`. Eleven checkpoints recorded zero page errors, console errors and source changes.
- **PASS, local MCP.** Discover the rectangle and joined path, refuse a stale path revision, and dry-run without changing the file. The Studio-approved proposal matches the direct 4 × 6 mm native body exactly.
- **PASS, affected checks.** Build the kernel with `build:fast`. Pass 82 kernel, 15 Model and 13 Studio tests, kernel, Model and Studio types, scoped ESLint, production Studio build, driver syntax and Git diff check.
- **PASS, retained desktop controls.** The opposite-turn rectangle and the same-turn circular annulus reproduce the earlier native hashes, volumes and topology at every shared checkpoint.
- **NOT_RUN.** Full local suites, WebGL2, mobile, a live model provider and general frame laws. The D1706 inherited code-shape failure and D1704 aggregate documentation failure were not rerun. Viewport chord approximation remains visible and is tracked by [#608](https://github.com/barocss/cad/issues/608). First mechanical CAD remains 8/10. Overall completion is unmeasured.

Independent volume is `width × 6 × (12π/2 + 18π/2) mm³`.

| Studio stage | Section (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct apply, edit after Open and Agent approval | 4 × 6 | 1130.9733552923253 | `10d7772198ad49a3cc81a475f564fbbc1dde16444e03bf6407b533a426a908de` |
| Width edit and fresh Open | 8 × 6 | 2261.9467105846497 | `68ea9c41f360c46c8e7f35d9cb786c9215603378c52a09c8185fe7c17b854d49` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Use `--same-turn --expect-refused` on the base.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-arc-sweep,exact-tangent-sweep,edge-continuity}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display sweep-agent-remap tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs
D1709_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/verified" --same-turn
D1703_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/opposite-rectangle-control"
D1708_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/same-turn-annulus-control" --same-turn --annular
git diff --check
```

Issue #10 stays open for general path, section and frame support.

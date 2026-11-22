# D1703 — Sweep a solid rectangle along an exact S-bend

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `54b91e701efc4bacdf349bc9c4569d7d3e77c677`.

The Exact S-bend accepts one solid rectangle with axes aligned to the bend radial and binormal. The center of the section follows the existing path of two coplanar, tangent, opposite circular arcs. The two native revolved pieces share a rectangular section. Glue its four edges and bind both uses on each native planar or cylindrical chart. Keep named end caps and stable side tags. The radial half-width must clear both bend axes. A rectangle with a hole or a misaligned roll is refused.

## Verification

- **FAIL, base capability.** Desktop Studio joined the two rational arcs and refused the valid rectangular section. Apply stayed disabled and the joined document stayed identical.
- **PASS, native geometry.** One closed genus-zero shell has 10 faces, 20 edges, 12 vertices and 40 reciprocal coedges. Both end caps have four straight edges. Each bend has two native planes and two cylinders at the expected radii. Both pcurve lifts on the four shared seams agree with the native edges. Tests cover the XYZ and oblique frames, the radial Y case, the 30° and 120° limits, a binormal extent beyond both radii, editable persistence and typed refusals for both axes, roll and holes.
- **PASS, actual desktop Studio WebGPU.** Join the 12 and 18 mm quarter arcs, create the 4 × 6 mm Exact Sweep and measure all four joint angles as 0° in Studio. The larger native measured angle was `2.442e-14°`. The maximum pcurve gap was `1.066e-14 mm`. The two cylindrical joins have curvature jumps of `0.15` and `0.1339285714285714 mm⁻¹`; the two planar joins have zero jump. Reject a 24 mm radial width without changing the accepted part. Apply 8 × 6 mm, Undo, Redo, Save and open in a fresh context. Verify the unchanged path and the exact reopened B-rep. The ten checkpoints record zero source changes, page errors and console errors.
- **PASS, local MCP.** Discover the section support and path revision, refuse a wrong path pin, and dry-run with unchanged file bytes. Explicit Studio approval yields the same native body as direct creation.
- **PASS, affected checks.** 58 kernel, 15 Model and 13 Studio tests, kernel transpilation and type check, Model type check, scoped lint, production Studio build, driver syntax and Git diff check. The three desktop controls passed for the solid circular S-bend, annular S-bend and rectangular elbow. Both circular runs reproduce the native digests, volumes and topology recorded in D1682.
- **FAIL, inherited aggregate checks.** Kernel code-shape reports the same `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts` files as [D1682](../exact-annular-s-bend-sweep-2026-11-22/README.md). The refusal reference and API inventory `IV001` checks remain open as in [D1702](../pending-saved-chamfer-resize-review-2026-11-23/README.md).
- **NOT_RUN.** Full local suites, WebGL2, mobile, paid model provider, renderer quality changes, general Sweep frame laws and other profile families. First mechanical CAD remains 8/10 and overall completion is unmeasured. Issue #10 remains open.

The independent volume is `width × 6 × (12π/2 + 18π/2) mm³`.
The desktop viewport still shows chord facets at this scale. The native certificate measures the analytic surfaces and their joins.

| Studio stage | Width (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct apply and Agent approval | 4 | 1130.9733552923253 | `1eab07d33f5e0062e630bdcfbc6e4ef4b5ef57bea794478d82af79240a5eaf08` |
| Edited and fresh Open | 8 | 2261.94671058465 | `c9b7daf259c967de608047fa12f5874da32b2e2df7b6fc46ed67bc011cc417ea` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Use `--expect-refused` on the base.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-arc-sweep,exact-tangent-sweep,edge-continuity}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep}.test.mjs
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display sweep-agent-remap tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm --dir apps/library-docs check:docs
node --check apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs
D1703_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/verified"
D1681_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/solid-control"
D1682_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/annular-control" --annular
D1674_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/elbow-control"
git diff --check
```

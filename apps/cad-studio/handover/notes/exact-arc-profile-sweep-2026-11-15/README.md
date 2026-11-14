# D1298 — Sweep a line-and-arc profile along a circular arc

2026-11-15 · FEATURE · P5, rows 07 and 30

Exact circular arc carries one closed profile of lines and circular arcs along one 30°–90° rail. The outline's area centroid starts at the path start. The projected sketch axes set the roll, including when the first axis is parallel to the starting tangent. The kernel reuses Revolve to create rational walls, rails and planar end caps with the sketch's side tags. It checks native profile intersections and bend-axis clearance at segment endpoints and interior arc extrema. Holes, separate regions and profiles that reach the bend axis are refused. The existing exact disk construction and the default faceted mode retain their geometry.

- **PASS — local MCP and desktop Studio WebGPU.** A local L1 agent found the sketch and Direct curve, dry-ran the operation at 4375.293 mm³ and queued a proposal. Its Studio preview showed the proposed body before any committed body existed. User approval created one strict solid with six faces, six loops, twelve edges, eight vertices and 24 coedges. The two caps each had one outer loop. Editing the shared back-wall coordinate from 2 to 3 mm gave 4061.133938367 mm³. Both volumes and centroids matched the independent area moments and the Worker. The maximum reported edge-to-surface gap was 1.78e-15 mm. A separate Studio preview refused the same outline when its straight wall touched the bend axis. Undo, Redo, native Save, fresh Open and the reopened History inputs passed.
- **PASS — geometry and build.** 22 Kernel and 32 Model tests passed. Native checks cover the D-shaped section's exact cap boundaries, line and arc rails, tagged planar/cylindrical/toroidal walls, signed normals, independently integrated volume and centroid, reversed frame, and tolerance around both axis-wall contact and an interior arc extremum. Existing disk, straight, faceted and Revolve cases passed. Kernel and Model type checks, code shape, focused lint and Studio production build passed.
- **FAIL, corrected.** The first reverse-path test used the original profile Y direction. The real start at the opposite end falls back to the sketch Y axis for its projected X. The revised independent test checks both orientations.
- **FAIL — display quality.** The reopened WebGPU view shows faceting along the inner arc. D1296's disk-only display packet does not cover this solid. D1299 measures and addresses that path.
- **NOT_RUN.** Native Boolean and Fillet on this section, WebGL2, full local suites, hosted inference and mobile. Wider Sweep acceptance in [#10](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The heavy gate serialized testing. The desktop run matched 907 frozen source files with zero page errors, console errors and source changes. Its receipt SHA-256 is `c37da971be1a1c502e58b1eedf9fd099ec56a12dc15e08dbc07cb63f8e0c5926`. The native Save SHA-256 is `9cf206dee1d0c81914488403456933877f273c19766ce9bc1df43461c8b3d54e`.

```sh
pnpm --filter @barocss/cad type-check
pnpm --filter @barocss/cad-model type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-sweep,exact-straight-sweep,sweep-solid,frk-4-revolve,revolve-axis-admission}.test.mjs
D1298_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-profile-sweep-browser.mjs <external-evidence>
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test sweep-agent-remap tool-contract toolset proposals cylinder-display arc-sweep-display
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```

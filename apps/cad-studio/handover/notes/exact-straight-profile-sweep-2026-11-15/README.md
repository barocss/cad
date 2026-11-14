# D1297 — Sweep a line-and-arc profile with one through-hole

2026-11-15 · FEATURE · P5, rows 07 and 30

Exact straight Sweep carries one simple, closed outline of lines and circular arcs along one straight segment. It can carry one circular hole. The outer outline's area centroid starts at the path start. The sketch axes set the roll. An edit to the hole can change mass and centroid with the outer walls and path held in place. The exact disk seam keeps its existing orientation. The kernel accepts the hole only when its whole disk clears the outer boundary, using the native line/arc distances and an interior test. The straight mode creates planar caps and exact plane and cylinder walls through the prismatic builder. Native wall IDs use the authored sketch tags. The circular-arc mode retains its disk scope, and the default faceted mode retains its previous behavior.

- **PASS — desktop Studio WebGPU.** Opened the asymmetric line-and-arc profile and tilted Direct line, verified the arc mode and a tangent bore refusal, and applied Exact straight path. Edited the bore diameter from 2 to 3 mm through its named sketch parameter. The native result retained one body, genus 1, 8 faces, 10 loops, 18 edges, 12 vertices and 36 coedges. Each end cap had one inner loop, and the outer wall poles and face names stayed identical. Volume changed from 2722.566310326 to 2644.026493986 mm³ and matched the independent area × length formula and the Worker. Undo, Redo, actual native Save, fresh Open and the Sweep's reopened History inputs passed.
- **PASS — agent and checks.** Local L1 MCP discovered the updated profile limit. Dry-run measured 2722.566 mm³ and left the source file byte-for-byte unchanged. Eleven scoped kernel tests and 32 scoped Model tests passed. Independent checks cover the offset bore and outer cylinder, inward and outward normals, cap pcurves, centroid, native area, both straight path encodings and separate clearance refusals. Kernel and Model type checks, the kernel fast build and code-shape, scoped lint and Studio production build passed.
- **FAIL, corrected.** The first test requested a first derivative exactly at a knot where the evaluator does not define it. Sampling both adjacent spans passed. The boundary-binding checks still include the knot.
- **FAIL — generated reference checks.** The library documentation check reports inherited API inventory and refusal appendix drift. This milestone adds no public API surface or new refusal codes.
- **NOT_RUN.** Full local suites, WebGL2, mobile, hosted inference and native downstream Boolean/Fillet on the new mixed section. The wider acceptance in [#10](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The heavy gate serialized testing. The desktop run matched 908 frozen source files with zero page errors, console errors and observed source changes. Its receipt SHA-256 was `371859fe59398826dde8efae6b815a7449614e6e00949f6bce51ec8b79fe663b`. The native Save SHA-256 was `6ad25e698c07bcfbb416c182803f165de8bf438a7b2d75a649b195e8e809937e`.

```sh
pnpm --filter @barocss/cad type-check
pnpm --filter @barocss/cad-model type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-straight-sweep,exact-arc-sweep,sweep-solid,interpolated-hole-sweep-regression}.test.mjs
D1297_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-straight-profile-sweep-browser.mjs <external-evidence>
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test sweep-agent-remap tool-contract toolset proposals cylinder-display arc-sweep-display
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
pnpm --filter @barocss/library-docs check:docs
git diff --check
```

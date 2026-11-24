# D1898 — Sweep a disk through perpendicular native quarter arcs

P5 [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#10](https://github.com/barocss/cad/issues/10). Base `ed875023c61accd3452ad29767afe14aec3fc56b`.

Exact mode accepts a solid disk on two rational quadratic quarter arcs. The carriers have perpendicular planes and the same forward tangent at their shared point. The first bend's exit frame defines the second bend's disk seam. The Kernel checks the represented path poles and weights, existing radial clearance, the two shared half-circle edges and strict solid validity. This retains the existing opt-in Exact Sweep command and saved path.

- **FAIL, prior Studio.** Join preserves both native arcs. The exact preview then refuses with the coplanarity diagnostic. The baseline expected-refusal check passes. Its first harness expected the generic path diagnostic, and the follow-up checks the actual coplanarity text.
- **PASS, actual desktop Studio.** Twelve perpendicular states and twelve coplanar control states, with no source changes, page errors or console errors. For the R12/R18 path, R2 gives 592.1762640654 mm³ and centroid `(10.2769955664, 15.8197186342, 3.9032857994)` mm. The result is one genus-zero solid with 6 faces, 6 loops, 20 coedges, 10 edges and 6 vertices. The original caps are centred on `(0,0,0)` and `(12,30,18)` with outward normals −X and +Z. Both shared edges have reciprocal uses and two native pcurves. Maximum pcurve gap is about 1.83e−15 mm. Both shared edges show 0° in Studio. The measured curvature changes at those edges.
- **PASS, editing and local Agent.** A non-tangent path and diameter 24 mm touching the first bend axis refuse. Diameter 6 mm gives 1,332.3965941471 mm³. Undo/Redo, native Save and fresh Open preserve the path, diameter and edited native digest. Local MCP rejects a stale curve revision and leaves the original file unchanged during dry run. Explicit user approval in Studio creates the same R2 body as the manual command.
- **PASS, affected checks.** 255 Kernel, 35 Model and 10 Studio tests. Kernel library build, Kernel and Model types, Studio production build, scoped lint, browser syntax and Git diff check.
- **NOT_RUN.** Whole local suites, general transported frames, other noncoplanar sectors, arbitrary profiles, twist and scale, mobile and live providers. #10 remains open for the wider Exact Sweep family. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
(cd packages/barocss-cad && node scripts/tool.mjs build:fast)
node --test --test-concurrency=1 packages/barocss-cad/test/exact-*-sweep.test.mjs
pnpm --dir packages/barocss-cad-model test sweep-path-history sweep-agent-remap sweep-history-edit arc-sweep-display arc-sweep-mixed-display toolset tool-contract
pnpm --dir apps/cad-studio test sweep-path-feedback sweep-path-geometry tool-contract-mcp
D1898_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/studio" --orthogonal
D1681_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/coplanar-control"
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

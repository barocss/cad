# D1704 — Sweep a rectangular duct along an exact S-bend

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `aa0e4740f228f67f111457062cc9921612239cd3`.

Carry one centered rectangular opening with the existing bend-aligned outer rectangle. Reuse the opening policy and the two-arc native gluer. Bind the four exterior and four interior shared edges on both native charts. Keep both end openings and measure their retained material. Reject displaced, rotated or multiple openings, insufficient wall clearance, and profiles that reach either bend axis.

## Verification

- **FAIL, base capability.** Studio refused the centered 2 × 4 mm opening inside the 4 × 6 mm section. Apply stayed disabled. The exact two-arc path and source document stayed intact.
- **FAIL, first test assertions.** New checks assumed pcurves on end-cap uses and expected refusal at 0.0005 mm wall stock. The end-cap oracle verifies the native loop edges and signed areas. Both pcurves are required at each of the eight shared bend seams. The final wall tests distinguish 0.000005 mm stock from `1e-6 + 2e-13 mm` stock at the native seam-matching tolerance.
- **PASS, native geometry.** One closed genus-one shell has 18 faces, 20 loops, 40 edges, 24 vertices and 80 reciprocal coedges. The end caps have one exterior and one interior loop of four line edges each. The tests check both pcurve lifts at every bend seam, tangent continuity, curvature signs, independent volume, alternate opening winding, tagged sides, an oblique frame, and exact edit and reopen. The maximum pcurve gap in the Studio specimen is `1.066e-14 mm`. The maximum native angle is `2.442e-14°`.
- **PASS, actual desktop Studio WebGPU.** Create the duct and read 0° on all eight joined edges. The inlet and outlet center rays enter both openings. The adjacent rays hit the cap planes at X = 0 and 30 mm. Refuse an off-center opening and keep the accepted document. Change opening height from 4 to 2 mm with the same exterior chart hashes. Undo, Redo, Save and fresh Open preserve the shape. Verify both reopened mouths and the editable outline. The twelve checkpoints record zero source changes, page errors and console errors.
- **PASS, local MCP.** The command describes the profile. A dry run leaves the input bytes intact. Explicit Studio approval produces the same native body as direct creation.
- **PASS, affected checks.** 62 kernel, 15 Model and 13 Studio tests, scoped lint, kernel and Model types, production Studio build, browser driver syntax and Git diff check. Final-source desktop controls for the rectangular elbow duct, solid rectangular S-bend and annular circular S-bend match their previous native digests, volumes and topology. The positive duct browser run preceded a type-only annotation. The final types, build and controls include it.
- **FAIL, inherited checks.** Kernel code-shape lists the same three unrelated files as [D1703](../exact-rectangular-s-bend-sweep-2026-11-23/README.md). The generated refusal reference and API inventory `IV001` checks retain their previous failures.
- **NOT_RUN.** Full local suites, WebGL2, mobile, rendering quality changes, live model provider and general Sweep families. First mechanical CAD remains 8/10. Overall completion is unmeasured. Issue #10 stays open.

The independent volume is `(4 × 6 − 2 × openingHeight) × (12π/2 + 18π/2) mm³`.

| Studio stage | Opening (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | --- | ---: | --- |
| Direct apply and Agent approval | 2 × 4 | 753.9822368615503 | `7c75b0da2805376ee158c8cd8b47b09daca7f756b86c411f69231ddc39df5b6e` |
| Edited and fresh Open | 2 × 2 | 942.4777960769379 | `c336bced0c46b6b3cd6bca74308a2508b0fef3b1b23d8ac61b10b121893fac97` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Pass `--opposite-arcs --expect-refused` on the base.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-arc-sweep,exact-tangent-sweep,edge-continuity}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-opposite-arc-sweep,exact-opposite-arc-sweep}.test.mjs
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display sweep-agent-remap tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm --dir apps/library-docs check:docs
node --check apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
D1704_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/verified" --opposite-arcs
D1675_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/elbow-control"
D1703_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/solid-rectangle-control"
D1682_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/annular-control" --annular
git diff --check
```

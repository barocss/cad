# D1798 — Sweep two passages through directly joined opposite turns

P5 Exact Sweep, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `8e0f714be7b38385780cf4b9e5902b2dad7e0a7a`.

Extend the existing exact S-bend to two radially centered, axially separated rectangular passages. Bind three four-edge rings on both native bend charts at the shared section. The supported bends are coplanar circular arcs of opposite turn, 30°–120° each, with a common forward tangent. Existing radial, cover and axial web clearances apply.

- **PASS — original refusal.** The base Studio disables Apply for the paired rectangle on the R12/R18 quarter-arc rail and preserves the sketch and copied path source.
- **PASS — independent geometry.** One closed genus-two shell has 26 faces, 30 loops, 120 coedges, 60 edges and 36 vertices. Both ends have two separate exact rectangular apertures. All 12 shared edges have both charts and the correct exterior or aperture owner. The tangent-plane projection of the two solids is respectively −ρ sin(θ) and +ρ sin(θ). Positive radial clearance and the accepted angle range keep both interiors disjoint. Tests sample the trimmed native boundaries on both sides. The maximum chart gap for the Studio fixture is 1.066e−14 mm. The tangent matches at the join and the curvature difference is measured separately.
- **PASS — independent mass.** The 32 mm² net section and 15π mm path give 480π mm³. Native quadrature gives 1,507.9644737230967 mm³ and centroid (14.180281365794515, 15.81971863420549, 0) mm within 1e−7 mm. The narrowed 2 × 1 mm first passage increases the native volume to 1,602.2122533307868 mm³.
- **PASS — actual desktop Studio WebGPU and local Agent.** Preview, Apply, both mouth picks, all 12 native continuity measurements, eccentric and touching aperture refusal, edit, Undo, Redo, Save and fresh Open pass. Edit preserves the other aperture and join IDs. Edited native SHA-256 `24a67acc447a8f676f9b7bf7ceb35ce492a05e0c46cbf30827a56f42dfb34344` survives fresh Open. Restoring the first aperture and separately approving a local Agent proposal both reproduce original SHA-256 `2c95c2c4f906dd1de2f6ff01afbbe6eb4e16120f1a7f50a0624fd3907a933e71`. The Agent dry run preserves its source bytes.
- **PASS — regressions and controls.** The baseline, new flow, D1705 one-aperture direct S-bend and D1796 spaced same-turn controls record 45 snapshots, unchanged source capsules and no page or console errors. D1705 body and PNG hashes match its record. The two D1796 PNGs remain byte-identical. Kernel build, 235 affected Kernel tests, 54 Model tests, 36 Studio tests, scoped ESLint, Kernel and Model types, Studio type check and production build, and Git diff check pass.
- **FAIL — corrected first harness run.** The test waited for a presumed path label. It now waits for the visible `Exact two-arc path` label. The original refusal and all final Studio flows pass.
- **FAIL — inherited code-shape check.** The existing spread-minmax counts are 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar.
- **NOT_RUN — broader scope.** Full local suites, other backends, mobile, STEP exchange for this profile and pending Agent image review of the new directly joined paired duct. Direct same-turn paired inputs still refuse. Revolved physical terminal cap edges retain their inherited absent chart pairs. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. For the base run add `--expect-refused` to the first browser command.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-path-history sweep-agent-remap paired-spaced-arc-duct-evidence rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-finish-history history-feature-editor command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts
pnpm --dir packages/barocss-cad-model exec eslint src/chat/part/features.ts src/engine/errors.ts
D1798_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/direct-paired" --opposite-arcs
D1705_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --opposite-arcs --review
D1796_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-spaced" --spaced-same-turn --review
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

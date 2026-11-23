# D1803 — Sweep two passages through directly joined same-turn bends

P5 Exact Sweep, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `78c50c599412b6fcab116875d6c6888ee20559f0`.

Extend the exact directly joined pair to a 4 × 10 mm rectangle with two radially centered rectangular passages on coplanar same-turn arcs of unequal radius. Reuse the three-ring binding and the existing tangent, radial, cover and axial-web checks. Equal and tolerance-equivalent radii retain the existing single-carrier route and refusal for this paired section.

- **PASS — original refusal.** Actual Studio disables Apply for two rectangular passages on the directly joined R12/R18 same-turn quarter arcs. The source sketch and rail remain unchanged.
- **PASS — independent native geometry.** One closed genus-two shell has 26 faces, 30 loops, 120 coedges, 60 edges and 36 vertices. Both end planes point along −X and have two separate four-edge apertures. All 12 internal edges have both native charts, with a maximum checked gap of 8.882e−15 mm. The tangent matches. At a cylindrical join, the signed curvatures have the same sign and differ by the difference of the inverse wall radii. The two arcs stay on opposite sides of their common tangent plane within the admitted angle and radial clearances.
- **PASS — mass and editing.** The 32 mm² net section and 15π mm path give 480π mm³. Native quadrature gives 1,507.9644737230951 mm³ and centroid (6.3984672026842375, 15.819718634205493, 0) mm. A 2 × 1 mm first opening gives 1,602.2122533307886 mm³. Tests cover both radius orders, oblique placement, radial X/Y, opposite winding, near-axis clearance, 30°/120° corners, asymmetric lane edits and refusal rollback. Strict tests preserve both mouths, all IDs and the unaffected passage through reopen.
- **PASS — actual desktop Studio WebGPU and local Agent.** Apply, both mouths, all 12 native continuity measurements, eccentric and touching opening refusal, separate lane editing, Undo, Redo, Save and fresh Open pass. Edited native SHA-256 `6d549f357fc6e14aae56c33ab270438468628f1b5fbf4174b0743dcabecadbd9` survives fresh Open. Restoring the opening and explicitly approving a separate local Agent proposal reproduce original SHA-256 `58cdcc1b4e2266427a4358a03ac1be8cc9e5982bc2eae76a70bf1d3434db157f`. The dry run preserves the source bytes.
- **PASS — affected checks and controls.** Kernel library build, 246 Kernel tests, 60 Model tests, 36 Studio tests, scoped ESLint, Kernel and Model types, Studio type check and production build, and Git diff check pass. The four desktop flows record 43 snapshots with unchanged source capsules and no page or console errors. The opposite-turn D1799 body and both Agent PNGs and the D1713 single-opening before/edit native hashes match their records.
- **FAIL — corrected harness and test expectations.** The first baseline script failed before opening Studio because the new path flag was undeclared. The corrected baseline reproduces the existing refusal. The first Kernel run passed 245 of 246 tests. The old mixed rectangular/circular hole fixture still refuses and its assertion now checks the two-rectangle capability reason. Both fixes are test-only.
- **FAIL — inherited code-shape check.** The existing spread-minmax counts remain 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange and pending Agent image review for the new direct same-turn case. The revolved physical cap edges retain their inherited missing chart pairs. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. On base sources add `--expect-refused` to the first browser command.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-path-history sweep-agent-remap paired-spaced-arc-duct-evidence rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-finish-history history-feature-editor command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts
pnpm --dir packages/barocss-cad-model exec eslint src/chat/part/features.ts
D1803_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/same-turn" --same-turn-arcs
D1799_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-opposite" --opposite-arcs --review
D1713_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --same-turn
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

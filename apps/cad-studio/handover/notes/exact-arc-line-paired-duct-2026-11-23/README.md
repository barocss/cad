# D1800 — Sweep two passages from an arc into a straight span

P5 Exact Sweep, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `67d34a61c3107846d7ffd55e55c6d0b917cffa39`.

Carry two radially centered, axially separated rectangular passages through the existing exact arc-and-line path. Validate the paired section in the authored start frame. Reverse both loop windings with the frame reflection and restore authored side and cap names once. At the shared section, bind four exterior edges and four edges from each passage to their own bend and prism charts.

- **PASS — original refusal.** The base Studio disables Apply for two rectangular openings on the R20 quarter-arc and 10 mm straight span. The authored sketch and rail stay unchanged.
- **PASS — independent geometry.** One closed genus-two shell has 26 faces, 30 loops, 120 coedges, 60 edges and 36 vertices. The arc-side start and straight-side end both retain two separate four-edge apertures. All twelve internal join edges and all twelve edges on each end have both charts. Maximum checked chart gap is 1.066e−14 mm. The arc and line occupy opposite tangent half-spaces apart from the shared section. Tests cover radial X/Y, both axis signs, authored and positional side ownership, alternate winding and starting corners, and the 30°/120° bend limits.
- **PASS — independent mass.** The 32 mm² net section and 10 + 10π mm path give 1,325.3096491487338 mm³. Native quadrature gives 1,325.3096491487279 mm³ and centroid (8.489085304625268, 5.47458952024411, 0) mm. Narrowing the first opening to 2 × 1 mm gives 1,408.1415022205256 mm³ and centroid (8.487309914867886, 5.476364910001479, −0.1176470588235195) mm.
- **PASS — actual desktop Studio WebGPU and local Agent.** Both mouth picks, all 12 native continuity measurements, eccentric and touching opening refusal, separate passage editing, Undo, Redo, Save and fresh Open pass. Edited native SHA-256 `3cd4db85c98c70c27470f6d250e9eb6e1b793ee1873a9b0583b3f7e55998fb9b` survives reopen. Restoring the opening and separately approving the local Agent proposal reproduce original SHA-256 `25292709776f6d54b8c4ec4f4c082b88107ddcf01f69cc5fde03b6aff5bf2628`. The Agent dry run preserves its source.
- **PASS — controls and affected checks.** The base, new arc-to-line case, D1752 single-opening and D1783 paired line-to-arc controls record 48 snapshots with unchanged sources and no page or console errors. The two controls match both prior Agent PNGs. The native body hashes also match D1752 and D1783. Kernel library build, 241 Kernel tests, 60 Model tests, 36 Studio tests, scoped ESLint, Kernel and Model types, Studio type check and production build, and Git diff check pass.
- **FAIL — inherited code-shape check.** The existing spread-minmax counts remain 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange and pending Agent image review for the new arc-first paired case. First mechanical CAD remains 8/10 accepted. Overall completion remains unmeasured. Issue #10 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. On base sources add `--expect-refused` to the first browser command.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-path-history sweep-agent-remap paired-spaced-arc-duct-evidence rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-finish-history history-feature-editor command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts
pnpm --dir packages/barocss-cad-model exec eslint src/chat/part/features.ts src/engine/errors.ts
D1800_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/arc-line" --arc-and-line
D1752_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --arc-and-line --review --opposite-image
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-lead" --review
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

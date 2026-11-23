# D1792 — Sweep two passages through a spaced S-bend

P5 Exact Sweep, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `ee29782f781446d90265b7fd9aff7f758e1cce30`.

Carry two radially centered, axially separated rectangular openings through the existing exact opposite-turn arc–line–arc path. Reuse the native revolved bends, straight prism and shared-cap gluer. Keep each authored passage's own walls and edge charts across both tangent joins.

- **PASS, baseline reproduction.** The original Studio rejects the paired 4 × 10 mm section on the exact R12/R18 rail with an 8 mm span. Apply stays disabled. The authored sketch and rail stay intact.
- **PASS, independent native geometry.** One closed genus-two shell has 38 faces, 42 loops, 168 coedges, 84 edges and 48 vertices. Both terminal planes have one outer loop and two separate four-edge apertures with the correct side tags. Each native join group has 12 edges and two charts per edge. The maximum measured join angle is below 2e−14°. Maximum chart gap is 1.066e−14 mm. The analytic volume derives from net section area × (15π + 8). Native quadrature gives 1,763.9644737230974 mm³ for two 2 × 2 mm openings and 1,874.2122533307872 mm³ after making the first 2 × 1 mm. The independent centroid matches the native and Studio worker values within 1e−7 mm. Focused checks cover asymmetric edits, stable native ownership, alternate winding and lane order, rotated 30°/120° inputs, clearance, radial alignment and the prior unsupported cases.
- **PASS, actual desktop Studio WebGPU and local Agent.** Select the authored sketch and rail, Preview, Apply and inspect both ends and all 24 native tangent edges. Eccentric and touching apertures refuse without modifying the part. The narrower first passage retains the other passage, rail and seam IDs. Undo, Redo, Save and fresh Open reproduce native SHA-256 `799e90216fcbe3311b15a1f96757031391752e3860f994ce722c390761167df4`. Restoring the first aperture and explicitly approving a separate local Agent proposal reproduce the original body SHA-256 `380dbdbf82845c319272ad1318e15c2042e9bccfa2da4e6f0bb425b5780c6a21`. The Agent dry run keeps the source bytes.
- **PASS, controls and affected checks.** D1736 straight-span single duct and D1786 paired elbow reproduce their prior native body hashes. The four qualified desktop runs record 47 snapshots with unchanged source and no page or console errors. Kernel library build, 225 Kernel tests, 51 Model tests, 36 Studio tests, changed-file ESLint, Kernel, Model and Studio type checks, Studio production build and Git diff check pass.
- **FAIL, recovered first Studio oracle.** The reused elbow check required two stored pcurves at each physical terminal edge. The existing Revolve caps do not supply that pair. The final oracle verifies each exact terminal plane, loop, reciprocal edge and 3-D boundary. All 24 internal joined edges still require both stored charts. Terminal edge chart pairs remain absent for this producer.
- **FAIL, inherited Kernel code-shape check.** It reports the same spread-minmax counts of 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar. Changed-file ESLint passes.
- **NOT_RUN.** Full local suites, STEP exchange for this new paired profile, pending Agent image review, other viewport backends, mobile, live providers and wider section or path families. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #10 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. On base sources run the paired driver with both `--spaced-opposite` and `--expect-refused`.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
D1792_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/paired-spaced" --spaced-opposite
D1736_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --spaced-opposite
D1786_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-elbow" --straight-tail
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-path-history sweep-agent-remap rectangular-duct-proposal-review paired-line-arc-duct-evidence toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-finish-history history-feature-editor command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts
pnpm --dir packages/barocss-cad-model exec eslint src/chat/part/features.ts src/engine/errors.ts
node packages/barocss-cad/scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

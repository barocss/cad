# D1770 — Sweep two sealed rectangular cavities around a closed circle

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `58a463809ca263f0757c1c82dc9a5f93de3d00e8`.

Carry two separate rectangular openings around the exact R20 rail. Each opening is centered across the radial width and keeps its authored axial offset. Require positive outer cover and a positive web between cavities. Reuse the full revolution topology, authored side tags and native chart binding.

- **FAIL, original capability.** Actual Studio refuses the valid 4 × 10 mm profile with two 2 × 2 mm openings. The source stays unchanged and Apply stays disabled.
- **PASS, actual desktop Studio WebGPU.** Apply the exact Sweep and measure a straight split seam and a circular corner on each shell. Refuse a radially off-center cavity and a zero axial web. Shrink the first opening symmetrically from height 2 to 1 mm. Undo, Redo, Save and fresh Open preserve the edited geometry. The Y section shows the two cavity cuts on both sides of the ring. Restoring the height from reopened History recovers the initial native digest. Local Agent dry run preserves source bytes and explicit Studio approval reproduces the manual solid.
- **PASS, independent native geometry.** One solid contains three closed genus-one shells, 24 faces, 48 edges and 96 native charts. All 24 circular corners measure 90° and all 24 split seams measure 0°. The initial signed shell volumes are +1,600π, −160π and −160π mm³. Symmetric height editing shifts the world Z centroid to +2/17 mm. Native cavity, web and cover probes, independent inertia, authored loop order and tag checks pass. Maximum Studio chart gap is 1.066e−14 mm.
- **PASS, affected checks and controls.** 197 Sweep kernel, 37 Model and 14 Studio tests. Kernel library build and types, scoped lint, Model types, Studio production build, browser syntax and Git diff check pass. Twenty earlier native kernel fingerprints and five single-cavity desktop native records match byte for byte. Three passing desktop runs record 24 checkpoints with zero source, page or console errors.
- **FAIL, inherited.** Aggregate kernel code-shape reports the same spread min/max counts in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** The desktop outline retains tessellation segments. General Rendering remains held in #608.
- **NOT_RUN.** Full local suites, other multi-opening families, downstream Boolean and Fillet, pending image review for the paired cavity, exchange, alternate GPU backends, mobile and live providers. Issue #10 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Cavity heights | Native volume | Native B-rep digest |
| --- | --- | --- |
| 2 and 2 mm | 4,021.2385965949343 mm³ | `1f000a6990bfe2e0dd511e2ebd275bfafd318cee691a022749790e51aad4c6f5` |
| 1 and 2 mm | 4,272.566008882117 mm³ | `9a2e11cf04468e130bcf5fa21cf8a68fef3d31670ce59a203e3a6b05b96d6768` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/base" --expect-refused
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/verified"
D1762_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/single-control"
pnpm --dir packages/barocss-cad build:library
pnpm --dir packages/barocss-cad type-check
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback edge-continuity-scope section-view
pnpm exec eslint packages/barocss-cad/{src/brep/exact-sweep.ts,test/exact-closed-circle-sweep.test.mjs}   packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs
git diff --check
```

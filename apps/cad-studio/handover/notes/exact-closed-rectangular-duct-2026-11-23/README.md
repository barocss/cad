# D1762 — Sweep a centered rectangular opening around a closed circle

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `d637120727d96f1517b49b26224903c3836b80f2`.

Carry a rectangle with one centered aligned rectangular opening around the exact closed circular rail. Preserve the eight source side tags. Bind each native edge to the charts of both incident faces. Require strictly positive wall clearance and keep the cavity sealed.

- **FAIL, original capability.** Desktop Studio refuses the valid R20 rail with a 4 × 6 mm outer section and a 2 × 4 mm rectangular opening. Apply stays disabled and the source stays unchanged.
- **PASS, desktop Studio WebGPU.** Preview and apply the exact Sweep. The Continuity panel measures a 90° corner and a 0° split seam on each shell. History Edit rejects eccentric and wall-contact openings. Edit the cavity height from 4 to 2 mm. Undo, Redo, Save and fresh Open preserve the expected native geometry. The live Y section shows two cuts through the same sealed cavity in the hatched material. Restore the cavity height through reopened History. The local Agent refuses a stale rail pin, previews without writing and stages an explicit Studio approval. The approved B-rep matches the manual result.
- **PASS, native geometry.** One solid has two closed genus-one shells, 16 faces and loops, 32 edges, 16 vertices and 64 native pcurves. Each shell has eight 90° corners and eight 0° seams. Signed shell volumes, quadrature volume, independent inertia and meridian classifications verify the outer wall and sealed cavity. Reflection, swapped axes, reversed travel, tags and axis-clearance rejection pass. The maximum Studio chart gap across the two cavity heights is 1.066e−14 mm.
- **PASS, affected checks and controls.** 194 Sweep kernel, 36 Model and 14 Studio tests. Kernel library build, kernel and Model types, scoped ESLint, Studio production build with types, both browser syntax checks and Git diff check pass. Eighteen earlier kernel geometry and mass fingerprints and ten earlier desktop solid-rectangle and annulus records match exactly. Four desktop runs record 39 checkpoints with zero source, page or console errors.
- **FAIL, inherited.** Aggregate kernel code-shape reports unchanged spread min/max counts in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** WebGPU section hatching shows material at the cut. The visible ring retains display tessellation. General Rendering remains on HOLD in #608.
- **NOT_RUN.** Full local suites, general curved frames or openings, downstream Boolean and Fillet, exchange, other GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #10 stays open.

| Cavity | Native volume | Native B-rep digest |
| --- | --- | --- |
| 2 × 4 mm | 2,010.6192982974665 mm³ | `ec8b60e48a1872d84394b3a8c62c7517fe698fe0d44699e092073448f12cd8e0` |
| 2 × 2 mm | 2,513.2741228718355 mm³ | `b246109cba71b1784b31971538d492639d1ee55d3c52607d54efee32c65ffa6e` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
pnpm --dir packages/barocss-cad build:library
pnpm --dir packages/barocss-cad type-check
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback edge-continuity-scope section-view
pnpm exec eslint packages/barocss-cad/{src/brep/exact-sweep.ts,test/exact-closed-circle-sweep.test.mjs} \
  packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts \
  apps/cad-studio/test/{exact-closed-rectangular-duct,exact-closed-circle-sweep}-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs
D1762_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/base" --expect-refused
D1762_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/duct"
D1761_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/solid-control" --rectangular
D1753_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/annular-control" --annular
git diff --check
```

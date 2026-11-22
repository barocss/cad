# D1753 — Sweep an annular section around a closed circle

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `231470c008ca7adbb93a284004ba91dc9249811d`.

Carry one circular disk with a concentric bore around the existing four-quarter exact circular path. Use one full revolution with an outward shell and an inward cavity shell. Bind each coedge to its native surface chart. Require positive axis clearance and wall thickness.

- **FAIL, original capability.** Desktop Studio refuses the concentric bore on the authored R20 circle. Apply stays disabled and the input document is retained.
- **PASS, desktop Studio WebGPU.** Draw the R20 circle, convert it to a Direct curve, and use it to sweep the Ø4 mm annular section. Read 0° on all 16 native seams. Refuse wall contact. Change the bore radius from 1 to 1.5 mm, Undo, Redo, Save and fresh Open. The Y section displays both cuts through the enclosed cavity after Open. This is the viewport clip and hatch result. Edit the bore back to 1 mm after Open. An explicit local Agent approval produces the same native body as the manual Sweep.
- **PASS, native geometry.** One material body with two closed genus-one shells, eight faces, eight loops, 16 edges, eight vertices and 32 rational pcurves. There are zero planar end caps. Signed shell integration, independent inertia and closed-form volume, and material, cavity, exterior and boundary probes against native meridian curves pass. The R20 fixture has a maximum chart gap of 5.39e−15 mm, sampled surface residual of 4.45e−15 mm and tangent angle of 3.27e−13°. Reported curvature jumps are within 3.89e−15 mm⁻¹.
- **PASS, controls and affected checks.** 186 kernel Sweep tests, 30 Model tests and 9 Studio tests. Kernel library build, kernel and Model types, scoped lint, Studio production build, browser driver syntax and Git diff check pass. Fourteen existing kernel B-rep and mass digests match. Both earlier D1673 desktop disk digests match. All 28 desktop checkpoints complete with zero source, page or console errors. The annular and disk runs each use two Studio Save files.
- **FAIL, recovered test fixture.** The first minimum-radius assertion placed 0.01 mm at a translated coordinate whose reconstructed radius rounded below the existing floor. The test now uses a centered 0.01 mm boundary. The floor is unchanged.
- **FAIL, inherited.** The aggregate kernel code-shape check reports eight spread min/max excess counts in the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files.
- **NOT_RUN.** Full local suites, WebGL2, exact Studio section volume, additional closed paths and profiles, downstream Boolean or Fillet, exchange, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #10 stays open.

| Bore radius | Material volume | Native B-rep digest |
| --- | --- | --- |
| 1 mm | 1,184.3525281307213 mm³ | `cea3ec6650d5579342012512f4edb3ab6da0914cc88d67bd98f0844338f4afb5` |
| 1.5 mm | 690.8723080762551 mm³ | `40a06fadbe32d78e397dcd7307bdbef0ac36be46f674e92ddb973b76b95eab94` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Use the candidate driver on the base for the refusal check.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback command-build-failure
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts \
  packages/barocss-cad/src/brep/exact-sweep.ts packages/barocss-cad/test/exact-closed-circle-sweep.test.mjs \
  apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs
D1753_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/base" --annular --expect-refused
D1753_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/annular" --annular
D1673_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/control"
git diff --check
```

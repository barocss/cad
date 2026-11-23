# D1761 — Sweep an aligned rectangle around a closed circle

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `240b1b6520ad4f80fd0e7455c39aa4608062585f`.

Carry one solid rectangle around the same exact four-quarter closed circular path used by the disk and annular sections. Keep its authored radial and binormal sides. Bind canonical edges to both cylindrical charts or the affine planar chart of each trimmed half-ring. Require positive clearance from the axis.

- **FAIL, original capability.** Desktop Studio creates the R20 circular Direct rail and refuses the valid 4 × 6 mm rectangle on that rail. Apply stays disabled and the document is unchanged.
- **PASS, desktop Studio WebGPU.** Draw the rail in Sketch and use Make curves. Sweep the aligned rectangle and measure all 16 native edges. Eight circumferential edges read 90° and eight split seams read 0°. Refuse radial axis contact. Edit width from 4 to 6 mm. Undo, Redo, Save and fresh Open preserve both sets of native angles and the edited ring. Restore 4 mm through reopened History. Explicit local Agent approval matches the original manual B-rep.
- **PASS, native geometry.** One closed genus-one shell, eight faces, eight loops, 16 edges, eight vertices and 32 native pcurves. Four half-faces are planar annular walls and four are cylinders. Their trimmed boundaries retain both exact radii and there are zero path-end caps. Independent native signed volume, inertia, rail-axis clearance and meridian material, exterior and boundary probes pass. The R20 fixture verifies radial X and radial Y sections, reversed oblique travel, names and fresh native replay. The maximum Studio chart gap across the two widths is 1.04e−14 mm.
- **PASS, affected checks and controls.** 190 kernel, 30 Model and nine Studio tests. Full kernel library build, kernel and Model types, scoped ESLint, Studio production build with types, browser syntax and Git diff check pass. Sixteen earlier kernel geometry and mass digests match. Nine earlier desktop disk and annulus digests and volumes match. The four passing Studio runs record 41 checkpoints with zero source, page or console errors.
- **FAIL, recovered harness.** The first candidate created the valid ring. Its browser oracle then sampled the entire underlying planar chart as though it were the trimmed annular half-face. The final run checks the planar height and the actual native trim curves independently.
- **FAIL, inherited.** Aggregate kernel code-shape reports the unchanged spread min/max counts in cylindrical-bore, thicken-cylinder and thicken-planar.
- **Observed display limitation.** The visible ring outline has tessellation segments. The native circular trim and chart checks pass. General Rendering remains on HOLD in #608.
- **NOT_RUN.** Full local suites, a rectangular opening in a closed Sweep, general closed paths or roll, downstream Boolean and Fillet, exchange, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #10 stays open.

| Section | Native volume | Native B-rep digest |
| --- | --- | --- |
| 4 × 6 mm | 3,015.928947446201 mm³ | `d059592c3db3772252f90cf7ef1cb73128bb2e6e940bdfa80222ff589c05d766` |
| 6 × 6 mm | 4,523.8934211693 mm³ | `1191b6caa7c70c508303d574d1981d381d6921ecc37feff2f6e1061aaa88b974` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
pnpm --dir packages/barocss-cad build:library
pnpm --dir packages/barocss-cad type-check
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback edge-continuity-scope
pnpm exec eslint packages/barocss-cad/{src/brep/exact-sweep.ts,test/exact-closed-circle-sweep.test.mjs} \
  packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs
D1761_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/base" --rectangular --expect-refused
D1761_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/rectangular" --rectangular
D1753_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/annular-control" --annular
D1673_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/disk-control"
git diff --check
```

# D1839 — Refine the imported unequal two-guide Loft

P4 row [06](../../roadmap-rows/06.md) and P2 row [13](../../roadmap-rows/13.md), [#16](https://github.com/barocss/cad/issues/16). Base `2caf497f1`. Use the two exact STEP files and display reproduction from [D1838](../two-guide-loft-taper-step-exchange-2026-11-24/README.md).

- **FAIL, base.** Both strict STEP solids use the base display after fresh Open and show visibly faceted curves. Their exact curve, surface and mass checks pass.
- **PASS, display certification.** Only admit a single closed STEP solid whose oriented material loops, complete boundary curves, wall coefficients and cap planes match a reconstructed unequal, untwisted two-guide Loft. The cap support domain can extend beyond the four-edge trim. Match the oriented plane and the original trim. Use the existing bounded shared-boundary display template and remap to original imported face and edge IDs.
- **PASS, actual Studio WebGPU and WebGL2.** Open both D1838 files. In each Right orthographic camera, project 257 samples from the analytic rear rail and compare the raw base segments with the submitted refined segments. At 507 CSS px height, maximum X16 rail deviation goes from 0.99721 to 0.01248 CSS px in both renderers. At 489 CSS px height, X18 goes from 0.99110 to 0.08012 CSS px in WebGPU and from 0.99105 to 0.08011 in WebGL2. Actual pointer clicks select edge index 5 with native ID `n0_e68` in all four scenes. The two packets have 2080 and 4224 triangles and remain within the existing 0.01 mm error and 192 KiB bounds.
- **PASS, native invariants.** Exact imported bytes, native volumes, B-rep records, fixed-timestamp STEP re-export and canonical pick geometry stay unchanged. The base and refined paths have identical canonical positions, faces and edge tables. A same-count mutation keeps both incident wall boundaries, passes strict B-rep checks, and fails the taper match. Altered rails, weights, cap, stored chart or twin and separate twisted or equal-section profiles remain on the base display.
- **PASS, affected checks.** 11 Kernel tests, 29 Model tests, 45 Studio tests, Kernel fast build, Kernel and Model types, Studio types and production build, scoped lint, syntax and diff check. Four actual desktop captures, with 1204 frozen files per backend, zero console, page or source errors.
- **FAIL, recovered during implementation.** TypeScript rejected the first surface-grid comparison's dimensional type. The final check compares the two full rows of control points. The native round-trip fixtures pass again after expanding the coupled boundary mutation.
- **NOT_RUN.** Arbitrary third-party shape, twisted imported display, continuous face parameter-curve inspection, mobile and full local suites. The wider exchange scope in #16 remains open. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
(cd packages/barocss-cad && node scripts/tool.mjs build:fast)
node --test --test-concurrency=1 packages/barocss-cad/test/{two-guide-loft-display,loft-two-guides}.test.mjs
D1839_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-step-display-browser.mjs "$OUT/webgpu" "$D1838"
D1839_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-step-display-browser.mjs "$OUT/webgl2" "$D1838" --webgl2
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test step-export-scope api-loft-guide loft-guide-command
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test display-mode viewport step-export-preparation
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

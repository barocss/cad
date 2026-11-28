# D2236 — Balance native sampling of the reported rational cap

P0 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#774](https://github.com/barocss/cad/issues/774) · Base `6e3ca6e18`.

The reported clamped quadratic edge has weights `[1e-6, 1, 1e6]`. At the original parameter `1 / (1 + 1e6)`, its height is 0.005 mm. The former uniform stations gave a sampled peak near 2e-8 mm and a false sliver width of 7e-8 mm. A Möbius map places the existing station count along the same original curve with balanced geometric-progression weights. The edge evaluator still uses the stored coefficients and native parameter domain. Planar width, crossing confirmation, tessellation and native hidden-line projection use the balanced stations.

- **PASS, native reproduction and correction.** The original, reversed and two common-scale weight representations retain the 0.005 mm peak in the native mesh and visible top projection. Strict checks and planar scale admission pass. The two genuine sliver controls still refuse. The fixes preserve the source B-rep bytes. The tests include a non-unit native domain and a domain that cannot represent distinct balanced stations.
- **PASS, actual desktop geometry.** Both original and revised Chrome/WebGPU Studio opened the same closed STEP input with 100 mm chord, 2.5 mm arch height and 15 mm thickness. The original display lost the top width. Revised Studio picked the original top arch at (50, 2.5, 15) mm. The visible edge samples, exact weights and embedded STEP bytes survived project Save, Close, reload and Open. The Studio scene uses a separate scaled solid while the original open sheet is checked directly in the kernel.
- **PASS, affected checks.** 33 Kernel tests, kernel types and build, affected lint, production Studio build and whitespace.
- **FAIL, existing mass defect on the closed variant.** Studio reports 2.728141598 mm³ and centroid (74.994326, −616.828176, 7.5) mm. The built base also reports the same rounded 3 mm³ on import. Integrating the quadratic profile gives 2,500 mm³ and centroid (50, 1, 7.5) mm. The mass error is the next P0 investigation. The code-shape guard reports the same eight existing findings.
- **FAIL, initial drivers.** The first gauge variant exceeded the admitted weight bound. A second baseline expectation assumed both admitted gauge cases also failed the sliver check. The first solid capture expected the peak at every sampling count. The first Studio inspector expected an edge name without its import feature prefix. The corrected checks passed.
- **NOT_RUN.** An exact continuous mesh boundary, general adaptive sampling, external Projection package, external STEP reader, mobile and whole local test suites. The first mechanical CAD baseline remains 8/10.

```sh
bash "$OUT/baseline.sh"
bash "$OUT/checks.sh"
bash "$OUT/built-before.sh"
bash "$OUT/desktop.sh" studio-second
git diff --check
```

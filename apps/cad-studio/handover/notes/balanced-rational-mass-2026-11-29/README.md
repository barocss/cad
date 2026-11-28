# D2237 — Integrate the closed weighted arch in a balanced parameter

P0 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · Base `7ca0375c2` · Follow-up to the closed cap-sampling [#774](https://github.com/barocss/cad/issues/774).

The closed STEP arch from D2236 passed strict B-rep validation but yielded 2.728141598 mm³ and a centroid outside the body. The ordinary geometric representation gave the expected result. Fixed native Gauss stations missed most of the curve and patch contributions in the compressed parameter. Planar boundary integrals and whole quadratic-by-linear patch integrals now use the balanced stations and their positive Jacobian. Orientation and original native source data remain in use. When the mapped nodes cannot be represented, the exact quadrature attempt returns no result to its existing fallback.

- **PASS, independent mass oracle.** Integrating the profile `y = 10(x/100)(1 − x/100)` over a 15 mm extrusion gives volume 2,500 mm³ and centroid (50, 1, 7.5) mm. All ten Cartesian volume moments and area 3,335.829596661 mm² match. The tests include the ordinary control, the weighted source, reversed weights with transposed U/V, a common weight scale, translated origin, density and STEP readback. The source B-rep is unchanged.
- **PASS, actual desktop.** Chrome/WebGPU imported the same STEP bytes used at D2236 and reported 2,500 mm³. The current body and fresh project Open agree on volume and centroid. The original arch remains selectable and its native weights remain exact.
- **PASS, affected checks.** 66 Kernel tests, kernel types and build, affected lint, production Studio build and whitespace.
- **FAIL, initial checks.** The private boundary test rewrote only single-quoted imports in the built module. It now accepts both emitted quote forms. The first Studio locator expected an ungrouped number. The corrected test verifies the displayed `2,500`. The code-shape guard reports the same eight existing findings.
- **NOT_RUN.** General trimmed or multispan rational integration, external STEP readers, mobile and whole local suites. The first mechanical CAD baseline remains 8/10.

```sh
bash "$OUT/checks.sh"
bash "$OUT/desktop.sh" studio-fixed
git diff --check
```

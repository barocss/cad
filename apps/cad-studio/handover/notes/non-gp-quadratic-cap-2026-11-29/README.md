# D2246 — Restore the non-GP quadratic cap

P0 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#776](https://github.com/barocss/cad/issues/776) · Base `d4d6bd8bd`.

The reported clamped quadratic has weights `[2e-6, 1, 1e6]`. At its native parameter `1.4142115623759231e-6`, the 1 mm open sheet boundary reaches `y = 0.0041421356237309505 mm`. The endpoint weight ratio compresses the bend into a small part of the native domain.

- **FAIL, original.** The exact base returned strict sliver width 7.00e-8 mm. At quality 12 the named mesh and projected edge peaked at about 2e-8 mm. The same weight pattern on a closed 100 × 15 mm extruded arch gave 2.728141406 mm³ in actual Studio and put the reported centre outside the solid.
- **Decision.** Extend the existing Möbius map when the endpoint weight ratio exceeds 4:1 and the normalized middle weight lies in [1/2, 2]. Normalized weights [1, m, 1] then bound the denominator to [3/4, 3/2]. Sampling uses the same station count. Existing quadrature consumes the mapped nodes and the Jacobian. All evaluations use the original coefficients, knots and domain.
- **PASS, native.** The original open sheet passes strict checks and retains its exact peak in the quality-12 mesh and projected edge. Reversed endpoint weights and a non-unit domain with normalized middle weight above 1 pass. All three true sliver controls still refuse. The closed solid, transposed rational patch and STEP readback match the independent numerical oracle. For the reported weights, refined composite Simpson integration gives 2,140.486225480854 mm³, centre (50, 0.8397946462803674, 7.5) mm and area 3,287.244106546534 mm². A separate 16-case probe spanning middle weights from 0.5 to 2 had maximum errors of 3.57e-7 mm³ in volume and 4.10e-7 mm² in area.
- **PASS, rendered open sheet.** Projection source `165da252f` rendered the same native body and exact base/candidate kernels with the existing dyadic helper exposed to that consumer. At 1,000 × 1,000, quality 12, hidden off and original blue fill, the named SVG edge misses the physical peak by 3.810755574 px before and 0 after. An independently decoded CPU PNG has zero dark pixels within two pixels of the peak before and eight after. The render retains its polyline approximation diagnostic.
- **PASS, actual desktop.** Headed Chrome imported the same STEP bytes before and after. The repaired solid reports 2,140.486225480858 mm³, and the top edge at (50, 2.071067811865475, 15) mm is selectable. Project Save, Close, reload and Open preserve the original STEP bytes, evaluated weights, edge selection target and mass. All 1,299 frozen sources match across the run. No console errors.
- **PASS, affected checks.** 38 Kernel tests, 3 Studio tests, Kernel, Model and Studio TypeScript, affected lint and production Studio build.
- **PASS, full kernel on Node 22.19.0.** 3,314 passed, zero failed and two existing skips.
- **FAIL, initial runs.** The first desktop baseline locator used the direct native centroid for the imported STEP representation. The second run confirmed the imported result and preserved the same STEP fixture. A package-manager shim launched an earlier suite on Node 20 and that run was stopped. The three failures seen in that run passed in a focused Node 22 rerun and in the full Node 22 suite.
- **NOT_RUN.** General rational boundary sampling outside the declared weight window, general trimmed-patch integration and external STEP readers. The first mechanical CAD baseline remains 8/10.

```sh
bash "$OUT/desktop.sh" desktop-baseline-02 baseline
bash "$OUT/desktop.sh" desktop-fixed-01
node "$OUT/issue-native.mjs"
python3 "$OUT/inspect-render.py" "$OUT"
(cd packages/barocss-cad && node --test test/*.test.mjs)
git diff --check
```

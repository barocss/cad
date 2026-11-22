# D1714 — Retain native duct joints after an inlet Subtract

P5 downstream Boolean, rows 07, 08 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `82e7ae12ca2959449c591679f01622f7c00c583b`.

Subtract one box across the inlet of the D1713 same-turn rectangular duct. The box clips only the first bend, and the original outlet remains at X=−6 mm. Rebind an inherited whole straight cylinder seam only when both source uses have verified parameter curves and the final chart has the same complete boundary ruling. Compare the final clamped rational chart coefficients. The four coplanar wall joins merge during the existing Boolean. The four cylindrical joins remain measurable. A newly cut edge falls outside this binding rule.

## Verification

- **FAIL, base measurement.** The native Boolean and desktop Studio both built a strict genus-one duct with two open rectangular mouths and volume `737.9629234096 mm³` after the 1 mm trim. All four surviving cylinder joints returned `unsupported: missing-pcurve`. The base focused suite had 1 PASS and 3 FAIL. The first failing assertion checked the missing native use binding.
- **PASS, native geometry and refusal controls.** Both 1 and 2 mm trims retain 14 faces, 16 loops, 36 edges and 24 vertices in one strict genus-one solid. Both native uses of each retained cylinder edge have parameter curves. Angles and curvature differences agree with the authored radii. An input with absent or invalid source bindings receives no inferred binding. Volume agrees with independent section integration and native quadrature. All four final focused tests pass. An intermediate type check exposed an optional twin-ID narrowing error and passed after correction.
- **PASS, desktop Studio WebGPU.** Select the duct and cutter and apply Subtract. Measure 0° at all four cylinder seams. Edit InletTrim from 1 to 2 mm and check Undo, Redo, Save and fresh Open. The new inlet plane moves with the cut depth and the outlet geometry matches. Center rays pass both reopened cap planes and adjacent rays hit the cap lands. Change the reopened depth back to 1 mm and reproduce its exact native hash. Eight checkpoints recorded zero page errors, console errors and source changes. The maximum native pcurve gap is `1.609e-14 mm` and the maximum measured angle is `8.021e-14°`.
- **PASS, desktop control.** The original exact straight Sweep box Subtract creates an analytic through-bore and retains radius editing and native Save.
- **PASS, affected checks.** 50 related kernel tests passed before the type-only optional ID fix. The final kernel build:fast, four focused kernel tests, kernel type check and scoped ESLint passed. 14 Model and seven Studio tests, production Studio build and type check, scoped driver lint, driver syntax and Git diff check also passed.
- **NOT_RUN.** New inlet-rim continuity measurement, repeated downstream Boolean propagation, full local suites, WebGL2, mobile and a live model provider. The first mechanical CAD baseline remains 8/10. Issue #10 stays open.

For inlet trim `x`, define `F(r)=½[r² asin(x/r)+x√(r²−x²)]`. Removed volume is `6[F(14)−F(10)]−4[F(13)−F(11)]` in mm³.

| Trim (mm) | Removed volume (mm³) | Retained native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| 1 | 16.019313451949625 | 737.9629234096 | `5928f73cccda50cecc1b08cabad48ef7e522ceb0b3a52984f12e8cda41ef4235` |
| 2 | 32.15612307130245 | 721.8261137902462 | `bd96d2183ad335c84145d3d75710f1be0bde8cedc0085ad01bbddf5a76286229` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-duct-inlet-trim,exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-duct-sweep,analytic-boolean,boolean-face-sources,edge-continuity,exact-ring-intersect,exact-offset-ring-intersect,incremental-stitch-differential}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/analytic-boolean.ts test/exact-duct-inlet-trim.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test edge-continuity-scope continuity-angle-label sweep-path-feedback tool-contract-mcp
pnpm exec eslint apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs
D1714_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs "$OUT/verified"
D1292_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-boolean-browser.mjs "$OUT/straight-control"
git diff --check
```

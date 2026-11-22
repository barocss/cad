# D1724 — Retain the spaced Sweep joints after an inlet bore Fillet

P5 finish composition, rows 07, 08 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `542dbf9a54b77a26a9b65560bf34f0da62d56213`.

Apply the existing fitted Constant Fillet to the original bore inlet of the D1723 spaced annular Sweep. During the finish rebuild, retain each unmodified circular bend-to-straight join only when both input pcurves verify, unique whole-curve coefficient correspondence exists and both current native chart boundaries agree. Rebind under the current orientation and chart domains. The original builder continues to fit the inlet blend.

## Verification

- **FAIL, base composition.** A single desktop pick selects both inlet bore semicircles. R0.20 generates a valid fitted solid of 519.473996098625 mm³. Both original bend/straight joins lose the pcurves of all eight native edges. Continuity returns `missing-pcurve`. The focused kernel test reproduces this at R0.20 and R0.25.
- **PASS, desktop Studio WebGPU.** Refuse an oversized radius, Apply R0.20, edit to R0.25 in History, Undo, Redo, Save and open in a fresh context. The two physical cap rays pass their apertures. The adjacent rays hit the original cap planes at Y0 and Y30 mm. After fresh Open Study shows 0° on all eight unaffected inner and outer joint edges. Nine checkpoints have zero source changes, page errors and console errors.
- **PASS, native geometry.** One strict genus-1 body retains both annular caps and the eight original circular joins. Sampled whole-curve geometry and native wall families match at both joints. The rebuilt chart pcurves are usable on both sides. The inlet fit has 10 patches at R0.20 and eight at R0.25. Maximum native edge gap is `3.92e-8 mm`. Thirteen samples per contact edge satisfy independent plane/torus contact equations. A divergence calculation using the D1302 method with major R12, bore R1 and zero center height agrees with native volume within `3.34e-8 mm³`.
- **PASS, saved local readback.** The local MCP reads the accepted saved feature and reports 519.441 mm³. The reopened R0.25 body hash is `b937cee2c784c9ea3beddfd4ad64bc55f2ef2e6c8cd3a7aeac8fff8a90f4d488`.
- **PASS, affected checks.** 25 kernel, 22 Model and 16 Studio tests. Kernel build:fast, kernel and Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check. Focused tests reject missing and altered source bindings, mismatched live coefficients and duplicate correspondence. Reversed and transposed valid charts pass.
- **FAIL, inherited code shape check.** Three unchanged files retain their established spread/minmax excess, cylindrical-bore.ts (3), thicken-cylinder.ts (3) and thicken-planar.ts (2). The new helper has no excess. During verification the first native type command used the wrong package directory. The final package-scoped command passes.
- **NOT_RUN.** Other inlet features, outlet or varying Fillets, general fitter expansion, full kernel build and full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion is unmeasured. Issue #10 remains open.

| Fillet R (mm) | Independent volume (mm³) | Native volume (mm³) |
| ---: | ---: | ---: |
| 0.20 | 519.4739960868355 | 519.473996098625 |
| 0.25 | 519.4412724224861 | 519.441272455787 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-spaced-bore-fillet,arc-sweep-bore-fillet,exact-half-ring-fillet,r10-1,r10-2,r10-b}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/sweep-circular-join-bindings.ts src/blend/edge-finish.ts test/exact-spaced-bore-fillet.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test api-face-fillet api-variable-fillet finish-limits arc-sweep-display sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope history-fillet-radius-receipt
pnpm exec eslint apps/cad-studio/test/exact-spaced-bore-fillet-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-spaced-bore-fillet-browser.mjs
D1724_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-bore-fillet-browser.mjs "$OUT/verified"
git diff --check
```

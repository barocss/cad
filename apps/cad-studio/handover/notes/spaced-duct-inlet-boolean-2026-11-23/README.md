# D1739 — Retain the spaced rectangular duct joints after an inlet Subtract

P5 downstream Boolean, rows 07, 08 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `9a1f04afbbad3ddb638048d2575fbff0d6cf78ed`. Extends the [spaced S-bend duct](../exact-spaced-rectangular-s-bend-2026-11-23/README.md) and the [touching same-turn inlet trim](../exact-duct-inlet-boolean-2026-11-23/README.md).

Rebind the inherited whole straight edge on both native charts when a cylinder of the original Exact Sweep meets its planar straight-span wall. Require matching original pcurves, correct rational edge and chart coefficients, and a whole-edge match at the native roundoff limit on the result. The existing affine chart calculation is shared with Exact Sweep. A newly cut edge receives no inherited pcurve.

- **FAIL, base continuity.** The actual Studio Subtract builds a strict genus-one body with two perforated caps, 18 faces, 20 loops, 48 edges, 96 coedges, 32 vertices and native volume 865.9629234096012 mm³. The native inspection finds `missing-pcurve` on all eight inherited cylinder-to-plane edges. Both coedges of each edge lack bindings.
- **PASS, desktop Chrome / WebGPU.** Apply the inlet Subtract, measure 0° at four joins at Y12 and four at Y20, and edit the trim from X1 to X2 mm. Undo, Redo, Save and fresh Open retain the result and its measurements. Both center rays pass their own end cap and the adjacent material rays land at X2 and X30 mm. The uncut outlet geometry matches exactly. Restoring X1 after Open reproduces the original native hash.
- **PASS, independent native checks.** Both trims retain the strict genus-one topology. Native quadrature and volume agree with independent section integration. The inherited whole-edge pcurves lift to the exact world edge, and the measured curvature difference is the reciprocal wall radius. The tests reject inheritance from missing, shifted or malformed source UVs and from another source family. The new inlet edge uses remain unbound.
- **PASS, retained controls and checks.** The touching-duct trim at both depths and the untrimmed spaced S-bend retain their previous native hashes. The three desktop runs contain 35 checkpoints and zero source changes or browser errors. 70 kernel, 14 Model and 7 Studio tests pass. Kernel fast transpilation, kernel and Model types, scoped ESLint, Studio production build and types, browser driver syntax and Git diff check pass.
- **FAIL, inherited aggregate lint.** Kernel code-shape still reports unchanged `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts` spread excesses.
- **NOT_RUN.** New cut-rim continuity, a second downstream Boolean, other paths and frame laws, full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

For trim depth `x`, use `I(r) = [r² asin(x/r) + x√(r² − x²)]/2`. Removed volume is `6[I(14)−I(10)] − 4[I(13)−I(11)]` mm³. The retained volume is `16(15π+8)` minus that amount.

| Trim (mm) | Independent retained volume (mm³) |
| --- | ---: |
| 1 | 865.9629234096006 |
| 2 | 849.8261137902479 |

The native volumes are 865.9629234096012 and 849.8261137902487 mm³. The largest measured native angle and pcurve gap are 7.218e-14° and 1.609e-14 mm. The X1 and X2 native hashes are `61df50bffba5fb600cea6bfe6280e6bd845e8bdce07aac96adcd0de5b815f149` and `7b62206a55491a3c8837a4c0ed83fc48b4d1510f48e62aae1624955c935f2661`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-spaced-duct-inlet-trim,exact-duct-inlet-trim,exact-rectangular-arc-line-arc-sweep,exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-duct-sweep,exact-arc-line-arc-sweep}.test.mjs
D1739_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs "$OUT/verified" --spaced-opposite
D1714_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-duct-inlet-trim-browser.mjs "$OUT/control-touching"
D1736_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-spaced-untrimmed" --spaced-opposite
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test edge-continuity-scope continuity-angle-label sweep-path-feedback tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

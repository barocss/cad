# D1620 — Measure the tangent angle at a straight-to-cubic Direct Join

P5, row 24, [#29](https://github.com/barocss/cad/issues/29). Base `4077b1885140a927d49124aecbd99f4c8a6d6b40`.

At the exact common knot of a supported two-span cubic Join, use the two endpoint tangent directions. Admit a clamped unit-weight curve when one span matches the native line elevation coefficients in one complete direction. Native Reverse can give that representation in the opposite direction. Studio and the revision-pinned local Agent share this measurement.

- **PASS, desktop Studio WebGPU and local MCP.** Join a 3D line and cubic, Save and open the native file in a fresh context. At t=4, Studio shows (25, 10, 0) mm and 76.757°. The Agent reads 76.7570237801765° at the same knot and point. The Agent refuses a missing or stale Direct revision and a parameter inside the line. The reopened document and saved file bytes match the accepted source.
- **PASS, independent geometry.** The original tangent directions are (6, 9, 18) and (18, −12, 6). Their dot product is 108 and the cross product is (270, 288, −234). The independent atan2 calculation gives 76.7570237801765°. The 65 native point samples have zero measured difference from the original line and cubic formulas on this fixture.
- **PASS, controls.** Model covers both Join orders, native Reverse, unequal domains, adjacent represented parameters, signed knot zeros, near-affine coefficient changes, rational weights and degenerate tangents. Studio retains the radius reads inside the two spans. The actual quadratic control still shows 54.462° at its original knot.
- **PASS, affected checks.** 47 Model and 14 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. The cubic and quadratic product runs checked 1,018 and 1,014 frozen files, with zero file changes, page errors and console errors.
- **FAIL, base capability by source inspection.** The degree-two admission returned no tangent angle for the degree-three Join.
- **NOT_RUN.** General cubic joins, other renderers, exchange, live models, mobile and full local suites. #29 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and native files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test direct-join-degree direct-join-tangents agent-direct-join-inspection direct-ruled-degree toolset
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/direct.ts packages/barocss-cad-model/test/{direct-join-degree.test.ts,direct-join-tangents.test.ts} apps/cad-studio/test/{curve-analysis-error.test.ts,direct-join-line-quadratic-browser.mjs}
pnpm --dir apps/cad-studio test curve-analysis-error join-endpoint-guidance ruled-endpoint
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-join-line-quadratic-browser.mjs
D1620_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE/cubic" --cubic --agent-inspect
D1614_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE/quadratic" --inspect-angle
git diff --check
```

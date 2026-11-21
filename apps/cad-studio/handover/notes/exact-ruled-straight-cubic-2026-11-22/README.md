# D1623 — Build an exact ruled surface between a line and cubic Bézier

P5, row 08, [#29](https://github.com/barocss/cad/issues/29). Base `d91806d5e1f969a4cdd8e1136f4190e21c98ba6a`.

Direct Ruled accepts one straight and one cubic clamped, unit-weight Bézier span on the same represented parameter domain. It checks the original domain and clamp slots before raising the line twice in scratch state. The native ruled constructor builds one degree 3 × 1 surface. The original two rails retain their source texts, directions and visible objects.

- **PASS, desktop Studio WebGPU.** Different domains refuse with both rails still selected. On the common domain [2, 4], Studio displays the midpoint normal. Swap reverses the normal. Swap back and create one surface. Undo, Redo, native Save and fresh Open retain both original rails and the exact native result.
- **PASS, independent geometry.** Compare both native rails and the interior to the line and cubic Bernstein functions blended by the V parameter. The 153-point grid has zero measured difference for this fixture. At (u, v) = (3, 0.5) the point is (25, 20.375, 3.9375) mm. The native normal agrees with the normalized independent cross product (−0.328125, −29.53125, 326.8125). The reopened native surface and samples match the saved result.
- **PASS, controls.** Model checks both rail orders, native Reverse, signed zero in the domain, mismatched domains and clamp slots, rational and multi-span mixed pairs, degree bounds and unchanged same-degree rational construction. The actual quadratic Ruled control still creates and reopens its original surface.
- **PASS, affected checks.** 67 Model and 39 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Each actual run checks 1,014 frozen files with zero changes, page errors and console errors.
- **FAIL, base capability by source inspection.** The former mixed-degree Ruled branch stopped at quadratic.
- **NOT_RUN.** General mixed-degree compositions, global sheet regularity, Thicken, exchange, other renderers, mobile and full local suites. #29 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep screenshots and saved files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test direct-ruled-degree direct-join-degree direct-join-tangents direct.test direct-display-domain
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/direct.ts packages/barocss-cad-model/test/{direct-ruled-degree.test.ts,direct-join-degree.test.ts} apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs
pnpm --dir apps/cad-studio test ruled-endpoint join-endpoint-guidance viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs
D1623_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs "$EVIDENCE/cubic" --cubic
D1611_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs "$EVIDENCE/quadratic"
git diff --check
```

# D1605 — Join an exact straight span to a quadratic span

P5, row 08, [#29](https://github.com/barocss/cad/issues/29). Base `21a8ae1cff35f0c13f093ad6a0e1c687f2d74093`.

Direct Join accepts one degree-one and one degree-two clamped, unit-weight Bézier span. The Model raises the straight span to degree two in temporary state and calls the existing native Join. The first end must equal the second start exactly in XYZ. Change the order explicitly if the opposite order matches. Join gives positional continuity (C0) and retains each span's shape and original tangent.

- **PASS, desktop Studio WebGPU.** Select the quadratic first and the straight span second. Join refuses and preserves both sources and the selection. Use Swap curve order and Join again. One joined curve is shown and both original source texts are retained. Undo and Redo restore the two exact states. Native Save and fresh Open preserve the curve and it can be selected in the viewport.
- **PASS, independent geometry.** Compare 65 native samples to the original linear and quadratic formulas. Maximum measured error is 0 mm for this fixture. The joined degree is 2, the shared point is [25, 10, 0] mm, and knots are [0, 0, 0, 1, 1, 2, 2, 2]. Weights are all 1. The re-opened native read matches the saved read exactly.
- **PASS, controls.** Actual Studio continues to warn and refuses a degree-one plus non-unit weighted quadratic pair with the same endpoint. It still joins the same-degree control. The Model checks both mixed-span orders, independent sample positions, nonstandard domains, gap and order refusal, and same-degree rational parity.
- **PASS, affected checks.** 27 Model and 38 Studio tests, Model and Studio types, scoped lint, production build, driver syntax and Git diff. The two frozen runs tracked 1014 and 625 files, with zero changes, runtime errors or console errors.
- **FAIL, base capability by source inspection.** The previous Model Join passed mismatched degrees directly to the same-degree native operation.
- **NOT_RUN.** Other renderers, exchange, mobile and full local suites. This mixed-degree profile does not adjust tangents or add support for other mixed degrees, rational spans or multiple spans. #29 remains open.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate. Keep screenshots and native files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test direct-join-degree direct.test direct-display-domain direct-sweep-source-ids
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/direct.ts packages/barocss-cad-model/test/direct-join-degree.test.ts apps/cad-studio/src/ui/{TwoCurveRoles.tsx,joinEndpointGuidance.ts} apps/cad-studio/test/{join-endpoint-guidance.test.ts,direct-join-line-quadratic-browser.mjs,direct-join-degree-browser.mjs}
pnpm --dir apps/cad-studio test join-endpoint-guidance viewport ruled-endpoint
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-join-line-quadratic-browser.mjs
node --check apps/cad-studio/test/direct-join-degree-browser.mjs
D1605_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE/mixed"
JOIN_DEGREE_FROZEN=1 JOIN_DEGREE_MODE=actual node apps/cad-studio/test/direct-join-degree-browser.mjs "$EVIDENCE/control"
git diff --check
```

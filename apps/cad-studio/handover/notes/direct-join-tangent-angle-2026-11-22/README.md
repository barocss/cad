# D1614 — Measure the tangent angle at an exact Direct Join

P5, row 24, [#29](https://github.com/barocss/cad/issues/29). Base `b230ddfc42bde63ef2a55a47735000b7df3dd4d4`.

The Direct curve inspector displays a tangent angle at the exact inner knot of the bounded D1605 two-span native Join. It reads the two one-sided Bézier endpoint tangents. The accepted curve has two clamped, unit-weight quadratic spans with at least one affine straight span. The exact parameter, finite coefficients and nonzero tangents are checked before measuring. The Angle row appears only for an admitted join. Each span keeps its existing radius inspection.

- **PASS, desktop Studio WebGPU.** Join the original line and quadratic curve. Save and fresh Open preserve the join and both source texts. At t=1, Studio reads the point (25, 10, 0) mm and displays 54.462°. At t=0.75, the inspector reports a straight span. At t=1.25, it reports a finite curve radius. Return to t=1 and verify the same angle and exact document.
- **PASS, independent geometry.** The original tangent directions are proportional to (15, 0, 0) and (10, 14, 0). The independent turn atan2(14, 10) is 54.46232220802562°. The selected Join still agrees with all 65 native point samples. Focused Model cases verify 0° and 180°, order and reversal, non-unit domains, exact knot representations, and refusal of degenerate and unsupported inputs.
- **PASS, affected checks.** 37 Model and 41 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. The actual product run checks 1014 frozen files with zero changes, runtime errors and console errors. The rational curvature control retains its existing inspector result in the Studio test.
- **FAIL, base capability by source inspection.** The inspector previously reported the exact join point and unavailable radius without a tangent angle.
- **NOT_RUN.** General or weighted joins, other renderers, exchange, mobile and full local suites. #29 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and saved files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test direct-join-tangents direct-join-degree direct-ruled-degree direct.test
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/direct.ts packages/barocss-cad-model/test/direct-join-tangents.test.ts apps/cad-studio/src/ui/{DirectPanel.tsx,curveAnalysisError.ts} apps/cad-studio/test/{curve-analysis-error.test.ts,direct-join-line-quadratic-browser.mjs}
pnpm --dir apps/cad-studio test curve-analysis-error join-endpoint-guidance ruled-endpoint viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-join-line-quadratic-browser.mjs
D1614_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE" --inspect-angle
git diff --check
```

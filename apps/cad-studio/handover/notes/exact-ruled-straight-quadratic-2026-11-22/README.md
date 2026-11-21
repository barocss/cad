# D1611 — Build an exact ruled surface between a line and quadratic curve

P5, row 08, [#29](https://github.com/barocss/cad/issues/29). Base `b5ae9097b779ecb4614c5a67121d6b1d79f1d1af`.

Direct Ruled surface accepts one straight and one quadratic clamped, unit-weight Bézier span on the same bit-exact parameter domain. The Model applies the existing exact degree elevation to the straight span in temporary state. The existing ruled constructor then produces a degree 2 × 1 surface. The original curve IDs and selection order govern the two boundary curves. The source curves remain visible and retain their original definitions.

- **PASS, desktop Studio WebGPU.** A distinct parameter domain gives a refusal and keeps both original rails selected. The matched pair has a midpoint direction in Studio and builds a native ruled surface with the two original rails. Undo and Redo restore the exact states. Native Save and fresh Open preserve the surface and visible rails.
- **PASS, independent geometry.** Compare 153 native samples to the affine combination of the original straight and quadratic functions. Maximum measured error is 0 mm in this fixture. The midpoint is (25, 21.75, 2) mm. The exact native surface and all samples agree after fresh Open. Model coverage exercises both selection orders, non-unit parameter domains, reverse direction, mismatched bits, incompatible curves, and existing same-degree rational construction and knot alignment.
- **PASS, affected checks.** 35 Model and 38 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. The existing mixed Join desktop workflow still passes. Both final runs check 1014 frozen files with zero changes, runtime errors and console errors.
- **FAIL, base capability by source inspection.** The previous Direct Ruled command passed the mixed degrees straight to the equal-degree native constructor.
- **NOT_RUN.** Other mixed-degree compositions, other renderers, exchange, mobile and full local suites. #29 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and native files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test direct-ruled-degree direct-join-degree direct.test direct-display-domain
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/direct.ts packages/barocss-cad-model/test/direct-ruled-degree.test.ts apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs
pnpm --dir apps/cad-studio test ruled-endpoint join-endpoint-guidance viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs
D1611_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs "$EVIDENCE/ruled"
D1605_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE/joined"
git diff --check
```

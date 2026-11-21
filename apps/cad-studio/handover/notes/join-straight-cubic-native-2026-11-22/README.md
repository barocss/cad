# D1617 — Join an exact straight span to a cubic Bézier

P5, row 24, [#29](https://github.com/barocss/cad/issues/29). Base `4feef811811a15cdf21987a8837338675795d313`.

Direct Join accepts one clamped unit-weight straight span and one clamped unit-weight cubic Bézier span. The first end must equal the second start in XYZ. The Model raises the line twice in scratch state to match the cubic and calls the existing native Join. The result retains both original shapes and has positional continuity at the shared point. Swap curve order remains explicit. Ruled retains its existing degree admission.

- **PASS, desktop Studio WebGPU.** Select the cubic first in a fixture whose line comes first. Join refuses and keeps both original sources and the selection. Swap the curve order and Join. Verify one degree-three curve, seven unit weights, the shared point (25, 10, 0) mm and exact original source texts. Undo, Redo, native Save and fresh Open keep the same result.
- **PASS, independent geometry.** The straight domain [2, 4] remains [2, 4] and the cubic domain [10, 14] maps to [4, 8]. Compare 65 native points to de Casteljau interpolation of the original poles. Maximum observed difference on this fixture is 0 mm, within the 1e−10 mm check. The Model compares both valid selection orders, non-unit domains, point samples and interior derivatives, plus a translated short straight span. The two scratch sources stay private.
- **PASS, controls.** The Model keeps the exact endpoint rule, rational and multi-span mixed-degree refusals, same-degree native parity and the existing Ruled degree guard. It keeps the D1614 angle out of the cubic join. The desktop straight-to-quadratic control still reports 54.462° at its exact join after Save and Open.
- **PASS, affected checks.** 49 Model and 42 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Both browser runs check 1,014 frozen files each and record zero runtime errors, console errors and file changes.
- **FAIL, base capability by source inspection.** The prior mixed-degree admission only accepted a straight and a quadratic span, so the straight and cubic reached the native same-degree refusal.
- **NOT_RUN.** Other renderers, exchange, mobile and full local suites. #29 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use the heavy gate and keep all evidence outside Git.

```sh
pnpm --dir packages/barocss-cad-model test direct-join-degree direct-join-tangents direct-ruled-degree direct.test direct-display-domain
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/direct.ts packages/barocss-cad-model/test/direct-join-degree.test.ts apps/cad-studio/test/{join-endpoint-guidance.test.ts,direct-join-line-quadratic-browser.mjs}
pnpm --dir apps/cad-studio test join-endpoint-guidance curve-analysis-error ruled-endpoint viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-join-line-quadratic-browser.mjs
D1617_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE/cubic" --cubic
D1614_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE/quadratic-control" --inspect-angle
git diff --check
```

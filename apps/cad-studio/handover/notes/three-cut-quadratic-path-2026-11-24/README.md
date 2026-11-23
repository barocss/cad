# D1862 — Repeat an earlier rectangular cut along one quadratic path

P1 [row 03](../../roadmap-rows/03.md), [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `74689e922712fb33fd4079875ddc673c179bf0c3`.

Path cut pattern now accepts one certified planar polynomial quadratic when the chosen rectangular through-cut predates one or two consecutive rectangular cuts on the same stock. Model and Kernel reuse the existing certified arc-length planner. The Kernel copies the authored path once, then checks exact common Z, span, weights and the existing work and geometric bounds. The cut copies keep their source orientation. Existing validation proves every placement against the original and both newer apertures.

- **PASS, actual desktop Studio.** Draw a two-point line, use Make curves and edit the middle pole to (20, 0, 0) mm. The ends remain (0, 0, 0) and (20, 20, 0) mm. Choose the earlier cut from Browser and History. Spacing 10 mm adds two copies. Spacing 17 mm with Count 3 is refused because the whole path is 32.4645048028 mm. A 12 mm History edit, Undo/Redo, native Save and fresh Open preserve both source owners and the linked curve.
- **PASS, independent geometry.** The closed-form integral and a separate bounded quadratic oracle agree with the two translations at 10 and 20 mm, (9.8046428489, 1.6361454658) and (17.2871389699, 7.9809608672) mm, within `1e-7` mm. Both cap loops retain the fixed 4 × 2 mm orientation, three original apertures and two new ones. One strict solid has genus five and 26 faces. Volume is 23,560 mm³ and centre is (30.1609786695, 20.0810964131, 5) mm. The two native collision fixtures retain their original solids and reject a collision with each newer aperture.
- **PASS, affected checks.** 81 Kernel, 50 Model and 9 Studio tests, Kernel library build, Kernel/Model/Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check. Two independent reviews pass. In-memory removal of the curved dispatch or exact-level gate is detected by its focused regression. Both production guards are present in the tested source. The full three-cut straight desktop control passes.
- **FAIL, initial Kernel check.** One earlier test expected all single curved spans to refuse. The updated test checks refusal of a rational span while preserving the existing multi-span and count-one checks. The final suite passes.
- **NOT_RUN.** Whole local suites, general curves, more distant ancestors, other renderers, mobile and paid providers. The wider #25 remains open. First mechanical CAD remains 8/10 and whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path,quadratic}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1862_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/quadratic" --quadratic
D1853_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/straight" --three
git diff --check
```

# D1758 — Chamfer two straight sketch sides with an authored angle

P1 daily Sketch editing, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `a08731200de31043718a30e3e74f76c34bb3f029`.

Allow an equal setback Chamfer at a non-right corner with a valid authored angle rule on its two straight sides. Preserve the physical included angle as the sides become separated. Drive the bevel's length and first joint angle so both setbacks remain equal and the original carrier planes remain in place.

- **FAIL, original Studio capability.** Select the two straight sides with Shift and enter D6. Studio asks to remove the corner constraints, disables Apply and preserves the source.
- **PASS, desktop Studio WebGPU.** Refuse an oversized setback without changing the body. Enter D6 and preview, Apply and Finish. The native vertical edges through (24, 0) and (34.8, 3.6) mm are each 6 mm from the original corner at (30, 0). The original included angle is 143.13010235415598°. The separated rule is 36.86989764584402°, the bevel joint angle is 161.56505117707798°, and the bevel length is 11.384199576606163 mm. Keep the five native carrier wall identities and the 10 mm Extrude. Undo, Redo, Save and fresh Open retain the geometry and constraints.
- **PASS, independent native check and local Agent.** The sharp part is 21,000 mm³. The removed triangle is 10.8 mm², yielding 20,892 mm³ after 10 mm extrusion. Native volume is 20,892.000000000004 mm³ and the original carrier planes remain fixed. The local Agent discovers the same pair, refuses a stale revision, and explicit Studio approval gives the same feature nodes and native B-rep.
- **PASS, affected and control checks.** 53 Model and 38 Studio tests, Model types, scoped lint, Studio types and production build, driver syntax and Git diff check. Model checks include a reflex corner, reversed rule order, winding reversal, wrap, incompatible angles and atomic refusals. 106 unaffected original corner outputs match byte for byte. The existing mixed-turn orthogonal Chamfer drag matches both D1699 native digests. Three passing runs record 17 Studio checkpoints with zero source, page or console errors.
- **FAIL, recovered harness.** The selected horizontal SVG marker has a zero-height bounds rectangle. The first driver waited for a visible bounding box. The final driver checks both attached selection markers and the actual Chamfer controls.
- **NOT_RUN.** Full local suites, resizing a saved non-right Chamfer, general batch angle coverage, a later point drag on the new non-right case, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #21 stays open.

Native B-rep digest for manual D6, reopened D6 and explicit Agent approval: `7f318268836989796a5e237e991d434d138200893b558bc5e6613a043019ad7a`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-chamfer-edit sketch-chamfer-retention
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/{src/sketch/corner.ts,test/corner.test.ts} apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs
D1758_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs "$OUT/base" --expect-refused
D1758_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs "$OUT/candidate"
D1699_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/right-angle-control"
git diff --check
```

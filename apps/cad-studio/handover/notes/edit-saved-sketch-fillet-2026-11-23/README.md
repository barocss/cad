# D1710 — Edit a saved sketch Fillet without moving its carriers

P1 advanced sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `e14fcd7aa7deabe58babcb3354066ad036baa808`.

Select the arc of a saved orthogonal sketch Fillet and choose **Edit Fillet**. Preview and apply its radius with the same control as **Edit Chamfer**. Identify the Fillet from its saved radius and tangent constraints. Retain the original straight support lines and side IDs. Keep the generic dimension editor available for dimension-driven changes.

## Verification

- **FAIL, base acceptance.** In desktop Studio the generic radius editor changed the certified R6 to R8 and translated the upper carrier from Y30 to Y31 mm. Its untouched endpoint also moved to Y31 mm. The native radius was correct, and the native centre moved to `(32,23,0)` with volume `12262.654824574372 mm³`. A local edit at fixed supports needs centre `(32,22,0)` and volume `11862.654825 mm³`. Source file bytes stayed identical.
- **FAIL, initial verification.** The first Model tests exposed two fixture errors. The first desktop run also kept a test locator from the previous Chrome context after fresh Open. Corrected fixture values and recreated locators for the active page.
- **PASS, desktop Studio WebGPU.** Select arc e5 of the saved sketch. **Edit Fillet** shows R6. Blank input and R30 disable Apply. R8 adds the preview while the saved sketch and original document retain their bytes. Apply records one sketch edit. Undo and Redo each restore the complete shape. Finish, Save, fresh Open and reopening the sketch retain the R8 value and rebuilt solid. Nine checkpoints recorded zero page errors, console errors and source changes.
- **PASS, native geometry.** Tangent ends are `(40,22)` and `(32,30)` at R8. The new cylinder centre is `(32,22,0)`. All four straight planes and all five side IDs match the original. The other corner at `(0,30)` remains on its original support. The strict 10 mm solid agrees with `[40 × 30 − R²(1 − π/4)] × 10 mm³` and its exact body hash survives fresh Open.
- **PASS, refusal and Model scope.** Studio refused changing a tangent endpoint bound to `FilletTangentY` and preserved the accepted value and file. Model tests cover separate convex and reflex group members, translated or rotated outlines, clockwise arcs, a retained circle, anchor and constraint refusal, and nonincident contact.
- **PASS, affected checks.** 62 Model tests, 50 Studio tests, Model and Studio type checks, scoped ESLint, production Studio build, driver syntax and Git diff check passed.
- **PASS, retained desktop controls.** The point-drag and saved Chamfer workflows retain their previous native hashes and geometry with zero page errors, console errors and source changes.
- **NOT_RUN.** General arc or support types, Agent modification, full local suites, WebGL2, mobile and a live model provider. The first mechanical CAD baseline remains 8/10. Issue #21 remains open.

The fixture includes an authored Fix on the sketch anchor. Studio shows the same redundant-constraint notice before and after the edit.

| Studio stage | Radius (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Original | 6 | 11922.743338823084 | `9e663d24e5d428c6b3161c776dd0ee25bf24958f6752c3744a7e0643eb0d0f3e` |
| Local edit and fresh Open | 8 | 11862.654824574367 | `7681b66cb929f4b39a58e3018636f1da717bd5619ad21ec2b7be31c943a435bd` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-fillet-edit sketch-chamfer-edit sketch-chamfer-retention sketch-point-drag revision-pinned-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/sketch/filletEdit.ts packages/barocss-cad-model/test/sketch-fillet-edit.test.ts apps/cad-studio/src/sketch/cornerDraft.ts apps/cad-studio/src/ui/{ConstraintTools,SketchCornerTools}.tsx apps/cad-studio/test/sketch-point-drag-browser.mjs
node --check apps/cad-studio/test/sketch-point-drag-browser.mjs
D1710_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/base" --radius-baseline
D1710_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/verified" --radius-edit
D1698_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/point-control"
D1700_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/chamfer-control" --resize
git diff --check
```

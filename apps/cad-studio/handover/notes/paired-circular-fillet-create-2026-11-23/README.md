# D1716 — Use one native radius handle when creating a two-rim Fillet

P4 Studio interaction, row 20. [Issue #214](https://github.com/barocss/cad/issues/214). Base `b2e2ee9c64a8eef476c730d69a7bab36e89b0ac0`.

Select the lower and upper open circular rims of an R8 quarter-sector prism before starting Constant Fillet. Use the same upper-rim source proof in the new command and in History. The proof requires two separate native quarter rims, the original shared upright cylindrical face, aligned circles and matching radial midpoints. Both direct edge selections keep one shared radius value.

## Verification

- **FAIL, base interaction.** Studio directly selected both native edges and created a valid typed R1.5 Fillet. The R0.6 creation handle was `101.278419486 CSS px` from the independently projected upper-rim anchor.
- **PASS, desktop Studio WebGPU.** Start from the unfilleted part. Click the lower rim in Bottom, Shift-click the upper rim in Top, and confirm two picked native edges. The shared handle is `0.000045325 CSS px` from the original upper-rim anchor. The 1.4 mm axis sample projects to `0.000004024 CSS px` in the end-on view. Its drag conversion is `43.178842 CSS px/mm`. A physical upward drag previews R1.5 with the original document intact. Apply, Undo, Redo, separately typing R1.5, Save and fresh Open pass. The reopened History still offers R1.5. All eight checkpoints record zero source changes, page errors and console errors.
- **PASS, native geometry.** Both original edges resolve to the same two strict toroidal blends. Their eight independent boundary trims, radius, axis and centers agree with D1715. The dragged, typed and reopened output hash is `2fa753284327819e9c0148bdfff18bfaad10c7063b5e9843d0397dc20292f9a2`. The native volume `491.02762723977276 mm³` agrees with independent integration within `3.18e-10 mm³`.
- **PASS, desktop controls.** The D1715 paired circular History drag and the original two-straight-edge creation drag both pass their native file flows.
- **PASS, affected checks.** 21 Model tests and 45 Studio tests, scoped ESLint, Model and Studio types, production Studio build, driver syntax and Git diff check passed.
- **NOT_RUN.** Other curved pairs, face-inferred edge groups, arbitrary placement, WebGL2, mobile and full local suites. First mechanical CAD remains 8/10. Issue #214 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Pass `--create --expect-generic` on the base.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test circular-fillet-handle native-fillet-torus-pair native-fillet-pair api-variable-fillet
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag gizmo
pnpm exec eslint packages/barocss-cad-model/src/app/{circularFilletPair,commands}.ts packages/barocss-cad-model/test/circular-fillet-handle.test.ts apps/cad-studio/src/state/historyFilletRadiusReceipt.ts apps/cad-studio/test/paired-circular-history-fillet-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/paired-circular-history-fillet-browser.mjs
D1716_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-circular-history-fillet-browser.mjs "$OUT/verified" --create
D1715_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-circular-history-fillet-browser.mjs "$OUT/history-control"
FILLET_END_ON_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-end-on-handle-browser.mjs "$OUT/straight-create-control" --two-edges
git diff --check
```

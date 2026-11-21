# D1532 — Drag saved inward tapered cap offsets in History

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `58ab5f44925e907c806d1f43890a489c675238a5`.

The existing terminal rectangular taper handle now supports a saved inward Offset on either cap. The original named source signature and exact current native cap still determine its frame. The handle uses the outward face normal as the direction of increasing signed distance. An inward gesture stops short of zero. Typed distance and reference-plane actions use their existing paths. Compute the requested anchor from the source height and signed distance so a tiny represented move is retained.

- **PASS, actual baseline.** Reopen the 15° taper with a saved −2 mm lower-cap Offset. The earlier History editor accepts typed −4 mm and has no distance handle.
- **PASS, actual desktop Studio.** On the same 20 × 10 × 12 mm stock, reopen saved −2 mm Offsets on the lower and upper caps in separate runs. Physical downward drags of 72 and 68 CSS px preview −4 mm in Bottom and Top orthographic views. A drag past zero in the opposite direction stops at −0.1 mm. Cancel and a late pointer move leave the current accepted distance exact. Dragged, typed, Undo, Redo, native Save and fresh Open agree.
- **PASS, independent native geometry.** The lower cap reaches Z4 mm with the upper cap fixed at Z12 mm, and the upper cap reaches Z8 mm with the lower cap fixed at Z0. All four wall supports, the six face names and 12 edge names agree. Each part is one strict closed solid. The −4 mm lower and upper results have 730.3682008265594 and 1134.550811997497 mm³, within 1e-7 mm³ of the independent volume integral. A focused tiny-distance check preserves the 1e-16 mm lower-cap anchor and rejects an upper draft that rounds back to the source plane.
- **PASS, affected checks.** Positive saved lower-cap browser control, 47 Model and 74 Studio tests, scoped lint, Model type check, Studio type check and build, browser syntax and Git diff. Independent native review verifies the signed direction, native axis position and same-sign bound.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Additional browsers, mobile, full local suites, pointer-driven collapse limits and other direct face types. #629 stays open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and keep receipts outside Git. Run the first desktop command before the product change.

```sh
node packages/barocss-cad-model/scripts/test.mjs offset-face-native native-offset-face
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag offset-face-launch-view offset-collapse-feedback offset-plane-pick-feedback command-hud-actions preview-lifetime history-feature-editor
pnpm exec eslint packages/barocss-cad-model/src/app/offsetFaceEdit.ts packages/barocss-cad-model/test/offset-face-native.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/offset-drafted-cap-browser.mjs
git diff --check
cd apps/cad-studio
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/baseline" --lower --history-handle-baseline --history-inward
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/lower" --lower --history-handle --history-inward
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/upper" --history-handle --history-inward
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/lower-positive" --lower --history-handle
```

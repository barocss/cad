# D1652 — Link the Exact semicylinder lower cap to a reference plane

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `07e31fd6b5a00974bfa3d2afb77357cedd239330`.

Offset face now offers **To plane** on both original axial caps of an upright, two-quarter Exact cylinder Thicken. On the lower cap, the existing native frame supplies the −Z normal. The saved recipe identifies the original cap and the earlier reference face. Evaluation computes the current signed distance from their native supports. History can retain the binding, pick another qualified face or use signed distance.

- **FAIL, on base.** The original lower cap offered only `d`. The linked Agent command refused the `offsetMode` field, and History omitted the mode control. Both cases pass after the change.
- **PASS, affected checks.** 55 Model and 17 Studio tests, Model and Studio type checks, Studio production build, scoped ESLint, browser script syntax and Git diff check. The Model covers parallel and opposite-normal references, History retarget, same-plane and collapse refusal, reference-prefix evidence after a later consumer and native Open.
- **PASS, actual desktop Studio WebGPU.** Picked the original lower face from Bottom, refused a perpendicular target, and bound to the reference top at Z=−2 mm. History refused a +14 mm reference move and kept the document and Undo entry. A +5 mm reference move took both faces to Z=3 mm. Undo, Redo, Save, fresh Open and the restored To plane edit passed. Six captures recorded 1,171 unchanged frozen files and zero page errors, console errors or source changes. Upper linked Offset and lower signed Offset also passed.
- **PASS, native geometry and wall evidence.** The upper cap stayed at Z=12 mm and the cylinder supports stayed at R8 and R10 mm. The full B-rep equals the original with its lower axial station moved. Native and Studio volumes were 791.6813487046264 and 508.9380098815465 mm³ and match the independent half-annulus within 1e−8 mm³. Fresh Open reproduces digest `8745b6b76cb42288c8302d021dabec92bfabbe499d08869aed27e118ea8101fa`. Local MCP returned current wall evidence at revision `18a40f847d7d21df477d4cbcfe1230d64791b6df1bbe1ff3d10d16e0c2274202` with measured wall 2 mm, names `n0.normal` and `n0.reverse` and a byte-identical saved file.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live models. Both issues stay open for broader face edits.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`) and output directories outside Git.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-cap offset-to-plane offset-plane-retention offset-face-native agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/{app/nativeOffsetFace,app/offsetFaceEdit,app/profileCommands,engine/doc,engine/offsetPlane,engine/exactThickenCapOffset}.ts packages/barocss-cad-model/test/offset-exact-cylinder-cap.test.ts apps/cad-studio/test/{exact-cylinder-cap-plane-browser,exact-cylinder-cap-offset-browser}.mjs
node --check apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs
node --check apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs
D1652_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs "$OUT/lower-plane" --lower
D1649_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs "$OUT/upper-plane"
D1650_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs "$OUT/lower-signed" --lower
git diff --check
```

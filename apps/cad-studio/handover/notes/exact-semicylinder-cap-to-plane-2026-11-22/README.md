# D1649 — Link the Exact semicylinder upper cap to a reference plane

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `186f049c700302f0a52ff771681f134ff78466da`.

The original Exact semicylinder upper cap now offers **To plane** alongside Distance. The document stores the earlier reference body, its original planar face and the existing native face witness. The Model calculates the current signed distance from the native prefix. The same kernel Offset moves the upper station of the semicylinder. This change preserves original face and trim identities and reuses the existing reference-plane editing flow.

- **FAIL, reproduced on the base.** The upper-cap command rejected `offsetMode` because it only exposed a distance. The linked case passes after the change.
- **PASS, affected checks.** 88 Model tests, 17 Studio tests, Model and Studio type checks, Studio production build, scoped ESLint, browser syntax and Git diff check. The Model covers opposite-normal retargeting, invalid nonparallel and same-plane targets, lower-cap collapse, original body and recipe retention, and the radial-wall check when a later feature consumes the reference.
- **PASS, actual Studio WebGPU.** Selected the original upper cap and refused a perpendicular face. Bound the cap to the reference box top at Z=14 mm. History refused a −14 mm reference move and kept the accepted model and Undo entry. A valid −5 mm move took both faces to Z=9 mm. Undo, Redo, Save, fresh Open and the restored To plane History field passed. Six checkpoints recorded equal capsules of 1,170 frozen files and zero file changes, page errors or console errors. The original signed semicylinder and axis-aligned prism reference controls each passed.
- **PASS, native geometry and wall evidence.** The bottom remains Z=0. The source retains R10 and R8 supports and the original incidence and trim charts. The native volumes at Z=14 and 9 mm are 791.6813487046264 and 508.9380098815465 mm³. Both native and Studio volume match the independent half-annulus within 1e−8 mm³. Fresh Open reproduces B-rep digest `728cfe3a570da51d8100073153dc638a82ec90f69a8b72f85bd2f923dd03e8f6`. Local MCP returned current evidence revision `32239dbd1427b5a6a6f5283eb9cd6596482b97a10146c84a9168e82da9477c3d` with measured wall 2 mm and names `n0.normal` and `n0.reverse`. The evidence check validates the binding in the Offset prefix and replays the native result from the current snapshot. It leaves the saved file byte-identical.
- **NOT_RUN.** Full local suites, WebGL2, mobile, STEP exchange and paid live models. The linked issues remain open.

Use Node 22.19.0, installed Chrome and Playwright (`CHROME`, `PW_DIR`), the heavy gate and output directories outside Git.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-cap offset-to-plane offset-plane-retention offset-face-native agent-offset-wall agent-axial-wall face-end-extrude
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/{app/nativeOffsetFace,app/offsetFaceEdit,app/profileCommands,engine/doc,engine/offsetPlane,engine/upperThickenCapOffset}.ts packages/barocss-cad-model/test/offset-exact-cylinder-cap.test.ts apps/cad-studio/test/{exact-cylinder-cap-plane-browser,exact-cylinder-cap-offset-browser}.mjs
node --check apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs
node --check apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs
D1649_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs "$OUT/cap-plane"
D1646_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs "$OUT/signed-control"
D1265_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-to-plane-browser.mjs "$OUT/prism-control" axis
git diff --check
```

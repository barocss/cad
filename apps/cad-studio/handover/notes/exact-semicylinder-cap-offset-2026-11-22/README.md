# D1646 — Offset the original upper cap of an Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `de0274a267d17967ce7a804b4cb7e5070b754ad2`.

Offset face now accepts the original upper cap of an Exact cylinder Thicken made from two canonical quarter spans. The operation adds one distance-only `offset-face` node. The kernel compares the target with the native solid from the original Thicken, then moves only the upper Z station. The fixed cap, cylindrical radii, native IDs and trim parameter charts are preserved. The same original cap is used in History and by the local Model Agent.

- **PASS, affected checks.** 116 Kernel, 86 Model and 15 Studio tests. Kernel, Model and Studio type checks, Studio production build, browser syntax, scoped ESLint and Git diff check. The targeted Kernel tests also cover reversed V, a parameter-driven thickness and the existing Exact planar path. Reject lower caps, wrong or stale source, transformed and chained results, unsafe inward distances and reference-plane mode at the applicable entry points.
- **PASS, actual Studio WebGPU.** Selected the upper cap in the viewport and dragged the +Z handle from +2 to +3 mm in preview. Applied +2 mm to reach 14 mm. History refused −12 mm and kept the accepted document. Edited the same feature to −3 mm, then verified Undo, Redo, native Save, fresh Open and the saved History value. Six checkpoints and 1,167 frozen files recorded zero file changes, page errors or console errors. The existing upper annular tube Offset passed separately.
- **PASS, native geometry.** The skins retain radii 8 and 10 mm and axis XY=[20, 20]. The lower cap remains Z=0. At heights 12, 14 and 9 mm the volumes are 678.5840131753930, 791.6813487046264 and 508.9380098815465 mm³. Studio and native volume and centroid agree with the independent half-annulus formulas within 1e−8. Each result is a strict closed genus-0 solid with 6 faces, 6 loops, 12 edges and 8 vertices. The maximum edge-to-surface gap is 1.78e−15 mm. Fresh Open reproduces native digest `728cfe3a570da51d8100073153dc638a82ec90f69a8b72f85bd2f923dd03e8f6`.
- **FAIL.** None in the final reported checks. The −12 mm refusal is the expected result.
- **NOT_RUN.** Full local suites, WebGL2, mobile, STEP exchange and paid live models. The Agent's named `radial_wall` query for an Offset output is a separate follow-up. The linked issues remain open.

Use Node 22.19.0, installed Chrome and Playwright (`CHROME`, `PW_DIR`), the heavy gate and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,bore-wall-offset,api-thicken,thicken-solid}.test.mjs
pnpm --dir packages/barocss-cad type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-cap offset-face-native face-end-extrude native-offset-result
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs
D1646_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs "$OUT/semicylinder"
D1610_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-bored-cap-browser.mjs "$OUT/tube-control" --tube
git diff --check
```

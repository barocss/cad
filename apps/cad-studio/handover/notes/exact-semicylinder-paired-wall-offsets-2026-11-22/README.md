# D1658 — Offset both original walls of an Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `d2e5380c5710c3a7b01d0b98f0879aab9def6206`.

An upright two-quarter Exact cylinder Thicken now accepts one signed radial Offset on each original skin in two separate features. The second feature targets the evaluated result of the first. The kernel replays the original Thicken and first edit before it admits the opposite wall. It retains the first wall's face, coedges, edges and vertices, preserves topology IDs and both axial stations, and refuses wall contact or crossing. Native wall evidence replays both authored steps and compares the full current B-rep before reporting thickness.

- **FAIL, base.** Both single-wall cases passed. The new second-wall command returned `available=false` for a valid pair. The same case passes with this change.
- **PASS, affected checks.** 135 Kernel, 59 Model and 17 Studio tests, Kernel and Model type checks, Studio type check and production build, scoped ESLint, script syntax and Git diff check. Kernel and Model verify both edit orders. They check retained geometry, reverse V orientation, positive and negative distances, non-dyadic values, recipe ownership, contact, axis crossing and the native file round trip. Both orders yield the same B-rep for the same two distances.
- **PASS, desktop Studio WebGPU and local Agent.** Picked the original outer wall and applied +2 mm. Picked the original inner wall on the edited solid and applied −1 mm. Studio and the revision-pinned MCP produced the same document at R12/R9 mm and 1,187.5220230569416 mm³. An upstream change to −1 mm made both radii R9 mm. Studio disabled Apply, retained the accepted document and kept the Undo entry. The valid upstream change to +1 mm preserved the second recipe. Two Undo and two Redo operations restored the expected documents.
- **PASS, exact result and fresh Open.** The reopened solid has R11/R9 mm and unchanged Z=0/12 mm ends. Its 753.9822368615479 mm³ and centroid match the independent half-annulus formulas within 1e−8 in the respective units. The maximum pcurve gap across the Studio checks was 7.95e−15 mm. Native Open reproduced digest `7e72e67e6194dc43abd7011ae8b48c0efe0b30a01cb02301fa012089a187c153`. Studio and local MCP passed the current 2 mm wall requirement. The read left the saved bytes unchanged. Five captures recorded 1,173 frozen files, zero source changes and zero page or console errors. The earlier single-inner-wall desktop control passed.
- **NOT_RUN.** Full local suites, reverse edit order in desktop Studio, WebGL2, mobile, exchange and paid live models. Same-skin and third edits, mixed cap chains, and native charts that fail exact retention remain outside the admitted scope. Both issues stay open.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-wall offset-exact-cylinder-cap offset-face-native offset-to-plane replace-face agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
D1658_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-paired-wall-offset-browser.mjs "$OUT/paired"
D1657_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-offset-browser.mjs "$OUT/inner-control" --inner
git diff --check
```

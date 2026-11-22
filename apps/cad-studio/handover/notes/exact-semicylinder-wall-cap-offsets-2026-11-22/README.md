# D1660 — Offset one wall and the original upper cap of an Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `2566f07f784db31d4bf4cf32af7ab83100940a6a`.

A clean upright two-quarter Exact cylinder Thicken now accepts one signed radial Offset on either original physical skin and one signed axial Offset on the original upper cap, in either History order. The kernel replays the first signed recipe and compares it with the current native solid. Both History orders then generate the final geometry in a fixed radial-then-axial order. The shared rim moves with the two edits. The selected radii, the cap station and the incidence IDs retain their meaning. The command and History expose signed distance for a pair. Model validation rejects either form of a linked-plane recipe in the pair before native evaluation.

- **FAIL, base.** Each single edit succeeded. Native evaluation refused both mixed orders, and Model refused to open the valid second command. The paired edit passes after this change. The first Studio proof also exposed an unsupported plane option in History. The final reruns verify the signed-distance editor for both orders.
- **PASS, affected checks.** 148 Kernel, 60 Model and 17 Studio tests, Kernel and Model type checks, Studio type check and production build, scoped ESLint, driver syntax and Git diff check. Kernel covers both physical skins, both V directions, positive and negative distances, non-dyadic values, exact replay and ownership, shared rim geometry, axis and wall contact, opposite-cap contact and third-edit refusal. Model verifies both skins, both orders, rejection of linked-plane pairs, native Open and current wall evidence.
- **PASS, actual desktop Studio WebGPU and local Agent.** Applied +2 mm to the original outer wall and +3 mm to the upper cap in two separate runs with opposite edit orders. Each document matches its revision-pinned local MCP result. Both runs produce the same B-rep at R12/R8 mm and Z=0/15 mm, with volume 1,884.9555921538665 mm³ and digest `6ce295b2d5530f8565d1b6b7494f531ce8d50eda593135fe64c2a2e74656eee8`. Volume and centroid match independent half-annulus formulas. The maximum pcurve gap across both runs was 7.95e−15 mm.
- **PASS, History and native Save/Open.** The −12 mm cap edit would touch the bottom. Both runs disable Apply and keep the accepted document and Undo entry. A valid edit of the first feature retains the second recipe. Two Undo and two Redo operations restore the expected documents. Fresh Open reproduces R11/R8, Z=0/15 mm after the wall-first edit and R12/R8, Z=0/9 mm after the cap-first edit. Studio and local Agent verify 3 mm and 4 mm current wall evidence respectively. The evidence read preserves file bytes. The two runs record ten captures and 1,174 frozen files each with zero source changes and zero page or console errors.
- **NOT_RUN.** Full local suites, the inner-skin mix in desktop Studio, WebGL2, mobile, exchange and paid live models. The supported pair includes one original upper cap and one original cylindrical skin. Linked planes, lower caps and third edits remain outside this mixed profile. The issues stay open.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-wall offset-exact-cylinder-cap offset-face-native offset-to-plane replace-face agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
D1660_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-cap-offset-browser.mjs "$OUT/wall-first"
D1660_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-cap-offset-browser.mjs "$OUT/cap-first" --cap-first
git diff --check
```

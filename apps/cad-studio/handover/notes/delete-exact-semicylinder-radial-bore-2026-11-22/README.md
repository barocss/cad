# D1664 — Heal a radial bore after an Exact semicylinder wall and cap edit

P5, row 31. [#17](https://github.com/barocss/cad/issues/17). Base `18bd92521f8ab1473ebcb3def6bf9788d870c23e`.

Delete face can heal one complete central radial through bore cut by a circular Extrude in an Exact semicylinder after a signed outer-wall Offset and a linked inclined upper-cap Replace face. Both stock edit orders are supported. The command stores one exact numbered bore-face signature. The kernel checks the current operands, the two skin openings, the two bore halves, the original supports and directed outer boundaries. It returns the exact current stock B-rep. The saved feature graph retains the cut, both stock edits and the cap's donor link.

- **FAIL, base.** The radial Subtract built a strict valid genus 1 solid. Delete face refused both numbered bore faces with `CAPABILITY`. The first new desktop run reached the correct face but asserted Apply before the preview settled. The driver now waits for Apply to become enabled.
- **PASS, affected checks.** 134 Kernel, 31 Model and 46 Studio tests. Kernel and Model type checks, Studio type check and production build, scoped lint, driver syntax and Git diff check pass. Native regressions include both edit orders, a negative Offset on translated and rotated stock, both bore halves, wrong or moved faces, blind bores, cap breakout, off-centre cuts and a geometrically identical cutter with an unrelated authored profile. The retained-boundary test passes on the original certificate and fails after removing its exterior boundary equality check from an isolated built copy.
- **PASS, actual desktop Studio WebGPU and local MCP.** Two runs create the Subtract through the Studio interface and pick the bore with the mouse. The part changes from genus 1 with eight faces and 1,199.9368986051506 mm³ to genus 0 with six faces and 1,228.2948465545637 mm³. The repaired B-rep equals the complete prepared stock B-rep. The donor remains identical. A closed-form stock volume and a separate integration of the cutter agree with the native and Studio measurements within 2.13e−8 mm³. A revision-pinned local MCP command naming the other bore half produces the same saved document. Choosing the original inner skin or resubmitting the old revision preserves the accepted file bytes.
- **PASS, History and native Open.** Undo restores the bore and Redo restores the exact stock. Moving the donor down 2 mm retains the authored cut and repair with R12/R8 mm walls and a 0.5 inclined cap slope. The moved exact result is 976.967434253626 mm³. Native Save and fresh Open reproduce the complete B-rep and donor binding. The maximum sampled pcurve gap of the restored stock is below 8.15e−15 mm. Each desktop run records eight captures and 1,173 frozen files with zero source changes, page errors and console errors.
- **FAIL, separate wall requirement consumer.** Both restored skins are present with radii 12 and 8 mm. Studio marks the saved `WALL-4` requirement unknown after healing. Local MCP returns `unsupported` on the reopened revision and preserves the saved bytes. D1665 will qualify the restored wall evidence.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live providers. Multiple bores and other direct-edit chains remain outside this profile. #17 stays open.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git. The desktop input for each edit order is its D1661 `03-combined-doc.bcad` before the donor moves.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-bore-delete,bored-face-delete,boss-face-delete,analytic-l-fillet-heal,prismatic-fillet-heal,prismatic-chamfer-heal,exact-cylinder-cap-offset}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test delete-bore-face delete-boss-face delete-chamfer-face revision-pinned-delete replace-face offset-exact-cylinder-wall
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test history-feature-apply history-feature-editor toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio build
D1664_SOURCE_FROZEN=1 node apps/cad-studio/test/delete-exact-semicylinder-radial-bore-browser.mjs "$OUT/replace-first" "$D1661/replace-first/03-combined-doc.bcad"
D1664_SOURCE_FROZEN=1 node apps/cad-studio/test/delete-exact-semicylinder-radial-bore-browser.mjs "$OUT/wall-first" "$D1661/wall-first/03-combined-doc.bcad"
git diff --check
```

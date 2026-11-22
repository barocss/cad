# D1665 — Verify the current wall of a healed Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17). Base `c40d058b6ea7192f40e925b6071fd15051036e3d`.

The shared `radial_wall` check measures an Exact semicylinder after the certified D1664 bore heal. It binds the stored bore half to the authored Difference and its current native operands. The current repaired solid must equal the exact replay of its uncut stock, including the wall Offset and the linked cap. The check then uses the radii of the two current native skins.

- **FAIL, base.** The saved `WALL-4` requirement read unknown in Studio and unsupported through local MCP after repair. Both native skins were present. The focused Model regression failed with unknown where a 4 mm pass was expected.
- **PASS, affected checks.** 29 Model and 14 Studio tests, Model and Studio type checks, scoped lint, driver syntax, Studio production build and Git diff check. The Model regression covers both stock edit orders, reversed query names, wrong names, the unhealed bore, a stale same-ID native solid, an unrelated downstream move and fresh Open.
- **PASS, actual desktop Studio WebGPU.** Both orders show unknown on the open bore and pass after Delete face. Undo restores the unknown bore state and Redo restores the pass. After donor motion and fresh Open, the requirement selects the two skins on the restored body. Editing the original outer Offset from +2 to +1 mm keeps the repair and makes the 4 mm minimum fail at a measured 3 mm. Undo returns to the pass. Redo, native Save and fresh Open keep the 3 mm failure. The reopened native solid has R11/R8 mm, genus zero and volume 711.8892969029655 mm³.
- **PASS, local MCP.** The reopened 4 mm and 3 mm documents report a current pass and a current fail respectively, with the original two face names. The 3 mm read refuses the earlier report revision and preserves the saved bytes. Each desktop run records 12 captures and 1,175 frozen files with zero source changes, page errors or console errors. Independent review compared the native ownership checks, receipt hashes and saved documents. The only node change between the two measured revisions is the signed wall Offset.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live providers. This check remains scoped to the certified stock recovery. #17 stays open for broader direct editing.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git. Each desktop run takes its D1661 `03-combined-doc.bcad` before donor motion.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face agent-axial-wall offset-exact-cylinder-wall offset-exact-cylinder-cap delete-bore-face
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/{chat/thickenWall.ts,chat/toolDefinitions.ts,engine/exactThickenEdit.ts} packages/barocss-cad-model/test/replace-face.test.ts apps/cad-studio/test/delete-exact-semicylinder-radial-bore-browser.mjs
node --check apps/cad-studio/test/delete-exact-semicylinder-radial-bore-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp history-feature-apply
pnpm --dir apps/cad-studio build
D1664_SOURCE_FROZEN=1 node apps/cad-studio/test/delete-exact-semicylinder-radial-bore-browser.mjs "$OUT/replace-first" "$D1661/replace-first/03-combined-doc.bcad" --wall-evidence
D1664_SOURCE_FROZEN=1 node apps/cad-studio/test/delete-exact-semicylinder-radial-bore-browser.mjs "$OUT/wall-first" "$D1661/wall-first/03-combined-doc.bcad" --wall-evidence
git diff --check
```

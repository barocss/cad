# D1647 — Verify the radial wall after an upper-cap Offset

P5, row 08. [#322](https://github.com/barocss/cad/issues/322) and [#17](https://github.com/barocss/cad/issues/17). Base `f4494a476fd99c91f2261e1ba63e594c6271e336`.

The `radial_wall` check now accepts the D1646 upper-cap Offset. It binds the two original skin names to the current owned solid. The Model checks the authored and compiled Offset, re-evaluates only the original Thicken with current parameters and reproduces the native Offset with the existing kernel helper. The complete expected B-rep must match the current one. The check reports the difference of the two measured native radii.

- **FAIL, reproduced on the base.** Both the admissible 2 mm wall and the truly thin 1 mm wall returned `unknown` after Offset. The same focused checks pass on the change. A stale proposal cannot approve after the source parameter changes.
- **PASS, affected checks.** 35 Model tests and 16 Studio tests, Model and Studio type checks, Studio production build, scoped ESLint, script syntax and Git diff check. Coverage includes both signs, reverse query order, a different native result with the same skin names, a different compiled Offset and a transformed output. The bounded axial Difference and Direct Thicken checks still pass.
- **PASS, actual Studio WebGPU and local MCP.** Local MCP proposed +2 mm on both parts and pinned each proposal to its current evidence revision. Studio previews preserved the source document. Studio refused the 1 mm wall with its measured value and left the proposal open. Studio approved the 2 mm wall and recorded one approval with before and after evidence revisions. Seven checkpoints recorded 1,168 frozen files with zero file changes, page errors or console errors. The earlier axial Difference approval and refusal flow passed separately.
- **PASS, native geometry and saved evidence.** The 2 mm wall retained its R10 and R8 skins and fixed lower cap at Z=0. The volume was 791.6813487046264 mm³ after approval at height 14 and 508.9380098815465 mm³ after a History edit to −3 mm at height 9. Both native and Studio volume matched the independent half-annulus within 1e−8 mm³. The approved evidence revision was `6ac6b85ba6adcebe364117be56eee44ab8d6107d97ca44422bd7515d52a80a85`. The revised geometry reopened with digest `728cfe3a570da51d8100073153dc638a82ec90f69a8b72f85bd2f923dd03e8f6` and current evidence revision `dd4df91b73130d53f09bd14a4e0d91ff0f8149e53eea34edb510a5f5407e8ab8`. MCP refused both outdated revision requests without evidence files. The current evidence named both original walls and measured 2 mm. The inspected saved files remained byte-identical.
- **NOT_RUN.** Full local suites, WebGL2, mobile, STEP exchange and paid live models. The linked issues remain open.

Use Node 22.19.0, installed Chrome and Playwright (`CHROME`, `PW_DIR`), the heavy gate and output directories outside Git.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test agent-offset-wall agent-axial-wall agent-direct-thicken-proposal offset-exact-cylinder-cap requirement-evidence proposals
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test proposal-review-availability proposal-history-focus
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/{chat/thickenWall,engine/upperThickenCapOffset}.ts packages/barocss-cad-model/test/agent-offset-wall.test.ts apps/cad-studio/test/exact-cap-offset-wall-approval-browser.mjs
node --check apps/cad-studio/test/exact-cap-offset-wall-approval-browser.mjs
D1647_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cap-offset-wall-approval-browser.mjs "$OUT/cap-approval"
D1642_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs "$OUT/axial-control" --wall-check
git diff --check
```

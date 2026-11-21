# D1474 — Approve a fresh repair of the remaining chamfer

P5, row 31 and agent review, [#17](https://github.com/barocss/cad/issues/17). Base: `9f7c7facdd86939f7426be671879834222de0444`.

Continue D1473 after the left repair has been approved and saved. Read the surviving right bevel `n2.face#2` from revision `5d7c278a6607d1d9`. Local MCP creates P3 on that revision. P2 keeps its earlier stale revision. The user reviews P3 and applies a second, separate Delete face.

## Verification

- **PASS, actual stdio MCP.** The reopened 11980 mm³ file exposes only the remaining original bevel. P3 records +20 mm³. The listing has accepted P1, stale open P2 and current open P3. The approved P1 checkpoint stays intact.
- **PASS, actual desktop Studio.** P2 offers no approval. P3 visibly previews the remaining sharp corner and leaves the working part unchanged. The user approves P3. History records P1 and P3 as independent approvals. The second native edit binds the exact remaining face and its signed planar signature. The restored 12000 mm³ box keeps the six stock face identities and both original sharp edge names.
- **PASS, history and file.** Undo of the second approval returns the exact 11980 mm³ body and preserved first approval. Redo returns the fully restored box. Save and fresh Open replay both approvals and the stale P2. Local MCP reads the same results. The original source, both pending files and the first checkpoint remain byte-identical. The final receipt reports zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 29 Model and 25 Studio tests, browser driver syntax and diff checks.
- **NOT_RUN.** Live provider output, parallel agents, full local suites, actual WebGL2, mobile, STEP and a dedicated local production rebuild for this test-only change. #17 stays open.

Use Node 22.19.0, existing Chrome and Playwright and the D1465 neighboring-chamfer fixture. Use the shared gate, freeze worktree writes during the desktop run and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs proposal-history-focus proposal-review-availability drawing-notice-lifecycle toolset-mcp tool-contract-mcp
node --check apps/cad-studio/test/neighboring-chamfer-proposals-browser.mjs
cd apps/cad-studio
CHAMFER_PROPOSALS_FROZEN=1 node test/neighboring-chamfer-proposals-browser.mjs "$EVIDENCE/studio-two-approvals" "$EVIDENCE/adjacent-chamfers.bcad" --finish
```

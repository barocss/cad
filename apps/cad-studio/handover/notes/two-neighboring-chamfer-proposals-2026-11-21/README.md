# D1473 — Approve one of two chamfer repairs on a common source

P5, row 31 and agent review, [#17](https://github.com/barocss/cad/issues/17). Base: `4197ae667e5d7e0e533ab6c38b840e62483eec88`.

Prepare two separate Delete face proposals in local MCP L1. Each names a different exact chamfer on the same original revision `53136f70095ade85`. Studio can preview either proposal while both are current. Approval of P1 changes the model and makes P2 stale.

## Verification

- **PASS, actual stdio MCP.** P1 binds `n2.face#1`. P2 binds `n2.face#2`. The same source revision produces both proposals. Each adds 20 mm³ and neither changes the pending 11960 mm³ model.
- **PASS, actual desktop Studio.** Preview the right repair and then the left repair while the working part remains unchanged. Approve only P1. The result is a strict 11980 mm³ solid with seven faces, seven loops, 30 coedges, 15 edges and ten vertices. The left sharp edge returns and the remaining bevel keeps its exact face record and ID. P2 remains open and stale. Its prior revision cannot preview, accept or recheck against the changed source.
- **PASS, history and file.** Undo restores the two current proposals and removes the obsolete refusal notice. Redo restores P1 with the right bevel still present. Save and fresh Open replay only the accepted edit. Local MCP lists P1 accepted and P2 stale, refuses P2 and keeps the saved bytes. Original input and pending proposal files keep their bytes. The final desktop receipt reports zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 29 Model and 25 Studio tests, browser driver syntax and diff checks.
- **NOT_RUN.** Live provider output, overlapping agent processes, full local suites, actual WebGL2, mobile, STEP and a dedicated local production rebuild for this test-only change. #17 stays open.

Use Node 22.19.0, existing Chrome and Playwright and the D1465 neighboring-chamfer fixture. Run heavy commands under the shared gate. Freeze worktree writes during the desktop run and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs proposal-history-focus proposal-review-availability drawing-notice-lifecycle toolset-mcp tool-contract-mcp
node --check apps/cad-studio/test/neighboring-chamfer-proposals-browser.mjs
cd apps/cad-studio
CHAMFER_PROPOSALS_FROZEN=1 node test/neighboring-chamfer-proposals-browser.mjs "$EVIDENCE/studio-two-proposals" "$EVIDENCE/adjacent-chamfers.bcad"
```

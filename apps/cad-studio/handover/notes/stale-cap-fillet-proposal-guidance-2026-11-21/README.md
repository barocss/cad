# D1470 — Report a stale repair to a restricted local agent

P5, row 31 and agent review, [#17](https://github.com/barocss/cad/issues/17). Base: `cba6081a9c5d1bb3efe9934d377989fee69f0ec0`.

An open proposal now reports a changed source or changed requirements when a restricted agent attempts to accept it. The autonomy gate continues to require user approval in Studio. A current proposal keeps the existing ready-for-user response.

## Verification

- **FAIL, baseline.** Actual Studio correctly disabled the R2 preview and approval after a History edit changed the fillet to R3. Rebase and preview refused the old pinned revision. The L1 MCP caller received “tell them P1 is ready” even though its listing marked P1 stale. The file stayed intact.
- **PASS, actual desktop Studio and stdio MCP.** R2 → R3 changes the independent volume from 11965.663706 to 11922.743339 mm³. Studio refuses the old revision and keeps the R3 feature and one open proposal. A Save preserves the stale state. MCP now reports that the source or requirements changed, and preserves the saved bytes. Undo restores the exact R2 source and enables review. One Studio approval then restores 12000 mm³. Save and fresh Open preserve the result and decision. The final receipt has zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 29 Model and 21 Studio tests, scoped lint, Model type-check, Studio production build, browser driver syntax and generated agent tool table. The Model test covers a stale proposal after requirements change without a geometry change, and the existing response for a current L1 proposal.
- **FAIL, separate UI recovery.** The refusal notice stays visible after Undo restores the valid R2 revision. D1471 tracks its document ownership.
- **NOT_RUN.** Live provider output, multi-agent scheduling, full local suites, actual WebGL2, mobile and STEP. #17 stays open.

Use Node 22.19.0, existing desktop Chrome and Playwright and the D1467 upper R2 fixture. Run heavy commands under the shared gate. Freeze worktree writes during the browser run and keep the scene evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs proposal-history-focus proposal-review-availability toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/{src/chat/part/proposals,test/proposals.test}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
DELETE_FACE_PROPOSAL_FROZEN=1 node test/delete-face-agent-proposal-browser.mjs "$EVIDENCE/studio-stale-recovery" "$EVIDENCE/top-fillet.bcad" --stale
```

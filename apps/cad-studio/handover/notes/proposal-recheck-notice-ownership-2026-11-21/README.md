# D1471 — Retire a failed proposal recheck notice with its source

P4 desktop review recovery, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `0e9ceddf181d47d6fd345cf223ae183eef50a27c`.

Give a failed proposal recheck notice to the exact document it reviewed. The existing Studio notice lifecycle removes it when Undo or another document change retires that source. The recheck also checks the current document when its asynchronous result returns. An earlier result from a different document can neither publish a notice nor commit its proposal.

## Verification

- **FAIL, baseline.** Actual desktop Studio rechecked the pinned R2 proposal after the source changed to R3. Undo restored the exact original R2 document and made Preview available. The earlier “P1 could not be rebased” notice still covered the viewport after the 2500 ms check.
- **PASS, actual desktop Studio and stdio MCP.** The notice appears on the applicable R3 failure. Undo retires it and restores usable R2 review. Redo makes P1 stale again while the old notice stays retired. A second Undo lets the user preview and approve. The original files remain intact. The final approved part is 12000 mm³ and opens with the same six original faces and saved decision. The final receipt records zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 29 Model and 25 Studio tests, scoped lint, browser driver syntax, diff check and Studio production build with type checking. The existing notice lifecycle controls cover replacement and unrelated notices.
- **NOT_RUN.** An artificially delayed recheck response, full local suites, live provider, actual WebGL2, mobile and STEP. #17 stays open.

Use Node 22.19.0, existing desktop Chrome and Playwright and the D1467 upper R2 fixture. Keep evidence outside Git, use the shared gate and freeze worktree writes during the actual desktop run.

```sh
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs proposal-history-focus proposal-review-availability drawing-notice-lifecycle toolset-mcp tool-contract-mcp
pnpm exec eslint apps/cad-studio/src/state/useProposalPreview.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
DELETE_FACE_PROPOSAL_FROZEN=1 node test/delete-face-agent-proposal-browser.mjs "$EVIDENCE/studio-notice-ownership" "$EVIDENCE/top-fillet.bcad" --notice-ownership
```

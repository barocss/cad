# D1625 — Propose a native Direct Ruled surface through the local Agent

P5, row 08, [#322](https://github.com/barocss/cad/issues/322) and [#29](https://github.com/barocss/cad/issues/29). Base `10e4db9dce5667e03bf618ed668aee462a166a18`.

Use `query.summary` to find two visible Direct curve IDs and their current `direct_revision`. In `proposals.propose`, pass one `features.command` operation with `command: "direct-ruled"`, `values: { first, second }` and that pin as `expectedRevision`. The rail order sets the surface's v = 0 and v = 1 boundaries. The command uses the native Studio Ruled operation. The proposed sheet stays outside the document and is drawn as a non-pickable overlay in Studio. Acceptance makes one undoable document change and records the user's decision. A changed source requires a new review.

- **PASS, local MCP.** Autonomy L4 refuses direct and batch application, a wrong revision, a repeated source ID and Agent self-acceptance. The valid proposal changes only proposal and history records. The Model regression also clears the saved approval reason and shows that Agent replay still refuses the Direct change.
- **PASS, desktop Studio WebGPU.** Before and after change the actual canvas. The proposed sheet has no outliner row and cannot be selected at its projected midpoint. Hiding the Crown rail removes the preview and a stale rebase is refused. Undo restores the current proposal. Explicit approval adds one surface with degrees (3, 1), U domain [2, 4] and V domain [0, 1]. Both original curve records and source strings are equal. Undo and Redo restore the exact pending and accepted versions. Save and fresh Open preserve the accepted document and native surface. Across 153 native samples the maximum observed difference from the independent line and cubic affine blend is 0 mm. Source capsule 1,021 files, with zero file changes, page errors or console errors.
- **PASS, affected checks.** Model 58, Studio 16, Model and Studio type checks, scoped ESLint (one pre-existing warning), Agent docs check, Studio build, browser syntax and Git diff.
- **FAIL.** No unexpected failures in the completed checks.
- **NOT_RUN.** WebGL2 product run, wider rail families in the Agent flow, paid live model, and full local suites. Both issues remain open.

Run with Node 22.19.0, installed Chrome and Playwright, and the heavy gate. Set the output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct direct-ruled-degree proposals toolset tool-contract
pnpm --dir apps/cad-studio test proposal
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-ruled-agent-proposal-browser.mjs
D1625_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-ruled-agent-proposal-browser.mjs "$OUT"
git diff --check
```

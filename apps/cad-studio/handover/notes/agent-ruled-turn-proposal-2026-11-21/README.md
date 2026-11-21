# D1519 — Propose Ruled Turn through local MCP

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `fed832e41c8f93e2e152d40a33141c73fdccf943`.

`features.command` exposes `ruled-turn` with a stable `values.sketch` ID and the mandatory current `expectedRevision`. The tool uses the same Ruled Turn authoring command as Studio. The sketch ID comes from `query.summary`. The pin comes from `query.rebuild` for the same part. Proposal replay checks both before geometry evaluation. The model script catalogue keeps the revision-dependent command out of its argument form.

- **PASS, local MCP and desktop Studio.** Discovery names two distinct rectangles. The proposal selects the earlier 12 × 8 mm rectangle explicitly and creates a −450° turn at height 50 mm. Direct write and direct acceptance refuse at autonomy 1. A missing or stale pin and unknown sketch refuse with the file bytes exact. The pending proposal preserves the original sketches and empty solid outputs. Studio previews and accepts P1 as the user. Undo, Redo, Save and fresh Open preserve the result.
- **PASS, independent native geometry and direct Studio control.** The accepted part contains one strict closed solid with 22 faces and 20 rulings. Independent signed coordinates agree with all ruling endpoints and midpoints within 1e-8 mm. Volume is 3199.999999999997 mm³. The approved, reopened and directly authored native B-reps share digest `0a404ac582070bc5c59d3b93f5462ba3238e0ee3963680688b855e93805b0b74`. The direct command also produces the same nodes and outputs. The unrelated second sketch stays exact.
- **PASS, local checks.** 52 Model tests, 25 Studio tests, scoped lint, Model and Studio types, Studio build, tool inventory, browser syntax and Git diff. The command pin control from the earlier Hole workflow still passes. The tool list and prompt total 24,974 characters. An independent source review found the script-catalogue edge case and requested explicit user-approval and total-body checks. All three are covered in the final run.
- **NOT_RUN.** Live model provider, broad twist law, STEP, full local suites and mobile. Both issues remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work. Keep the worktree frozen while Studio runs and retain evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs revision-pinned-command ruled-turn-command toolset tool-contract proposals shop-context-tools script
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability history-feature-apply
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/features,part/history,toolset}.ts packages/barocss-cad-model/test/revision-pinned-command.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
cd apps/cad-studio
RULED_TURN_AGENT_FROZEN=1 node test/ruled-turn-agent-browser.mjs "$EVIDENCE/agent"
node test/revision-pinned-command-mcp.mjs "$EVIDENCE/existing-pin"
```

# D1943 — Restore the local Agent tool description budget

P1 [row 8](../../roadmap-rows/08.md) and [row 12](../../roadmap-rows/12.md), [#324](https://github.com/barocss/cad/issues/324). Base `dd1a72b67c8bdb4b55ecb2019c610e2cf010c212`. Small change.

The v2 tool list removes the repeated action instruction from eleven grouped tool descriptions. Each group still lists its actions and requires `action` in its input schema. The shared system prompt still explains how to call a group. The action definitions, frozen contract and system prompt match the baseline.

- **FAIL, previous agreed budget.** Thirteen tools used 17539 serialized list characters and a 7621-character prompt, for 25160 total characters against the 25000-character limit.
- **PASS, current budget.** The list uses 17154 characters. The identical prompt keeps the total at 24775, which is 225 below the limit. Nineteen Model tool and held-finish recovery tests pass.
- **PASS, actual local MCP.** The same `tools/list` request is 59 bytes. The reply drops from 17726 to 17341 UTF-8 bytes including the newline. Eleven tool descriptions differ by only the repeated sentence. All tool names, order, input and output schemas and annotations match. The rejected edit, recovery edit and saved result match exactly. A rebuild reply differs only in the measured timing fields. Both edit exchanges together still send 273 bytes and receive 2522 bytes.
- **PASS, actual desktop Studio.** With the local scripted provider, an invalid height string preserves the initial document, History and 6400 mm³ volume. Retrying with 12 mm updates the exact volume to 9600 mm³. Undo, Redo, native Save and fresh Open pass. Model types, Studio types and production build, scoped ESLint and diff check pass.
- **FAIL, corrected verification assumption.** The first MCP comparison treated rebuild timing text as fixed wire bytes. The final comparison isolates the three timing fields and verifies all remaining replies and both saved files.
- **NOT_RUN.** Live-provider prompts, cached-input tokens, pricing, wider model tasks and mobile. #324 stays open for its broader evaluation. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
node packages/barocss-cad-model/scripts/test.mjs toolset.test tool-contract.test held-finish-recovery.test
node apps/cad-studio/test/agent-edit-cost-mcp.mjs --seed apps/cad-studio/test/fixtures/agent-edit-stock.bcad --output "$OUT/mcp"
AGENT_EDIT_COST_SOURCE_FROZEN=1 node apps/cad-studio/test/agent-edit-cost-browser.mjs --seed apps/cad-studio/test/fixtures/agent-edit-stock.bcad --output "$OUT/studio"
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

MCP wire evidence and the six actual Studio checkpoints stay outside Git.

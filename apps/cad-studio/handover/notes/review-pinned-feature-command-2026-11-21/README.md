# D1422 — Review-pinned feature commands

P4, row 04, [#324](https://github.com/barocss/cad/issues/324). Base: `455b393ebb635e4571b41649a150b10813223b7f`.

A face name can survive a model change. In the test plate, both the 8 mm and 10 mm versions expose `n1.top`. Before D1422, `features.command` did not accept the revision from visual review. An unpinned command resolves the face in the current part.

Add optional `expectedRevision` to `features.command`. Compare it with the current document in the same part scope, before command lookup or geometry selection. `COMMAND_INPUT` identifies an invalid pin. `COMMAND_STALE` returns both revisions and keeps the part unchanged. The same guard serves `features.edit` with its existing codes. For a batch, the revision must match the part at that operation. A failure rolls back the batch. Commands without a pin retain their existing behavior and approval rules.

## Verification

- **PASS, local stdio MCP.** Review A returned `6e773f4a793deeef` for the 8 mm stock. After a pinned height edit, rebuild and review B agreed on `644b252b57046a2c`. A Hole call with A returned `COMMAND_STALE` and preserved the 10 mm file byte for byte. B accepted one Ø6 through hole at (11, 9) mm on the same face. The two review PNG digests matched the decoded bytes.
- **PASS, desktop Studio.** Chrome opened the exact MCP file. The Studio worker measured 11717.256661176918 mm³. The strict native solid measured 11717.256661176889 mm³ against the independent reference `12000 - 90π` mm³. The bore survived a top-cap drag, a refused collapse, a −2 mm History edit, Undo/Redo, Save and fresh Open. The reopened strict solid measured 9373.805328941538 mm³ against the reference `8 × (1200 - 9π)` mm³. The tolerance was `1e-7` mm³. The original MCP file, watched Studio source and console had no changes or errors. The opened and reopened scenes were visually reviewed.
- **PASS, affected checks.** 45 Model tests, 7 Studio MCP tests, scoped lint, Model type-check, generated agent tool table and Studio production build. The grouped contract lists 13 tools. Discovery plus system prompt measured 24,989 characters against the 25,000 limit.
- **FAIL, base and intermediate.** The focused tests failed on the base because the command did not recognize the pin. The first batch assertion expected a nested code where the aggregate result carries the operation index and refusal text. The initial type-check reported a missing test evaluator argument and a nullable volume assertion. Both test corrections passed the final checks.
- **NOT_RUN.** External or paid AI clients, mobile, full workspace suites, and the full docs checker. D1421 records the older refusal-table and public API inventory drift. Whole-issue acceptance remains open.

Use Node 22.19.0. Run heavy commands in order under the shared gate and keep the repository frozen during Studio. Keep protocol receipts and screenshots outside the repository.

```sh
node packages/barocss-cad-model/scripts/test.mjs revision-pinned-command revision-pinned-edit toolset tool-contract views batch-changes proposals
node apps/cad-studio/scripts/test.mjs toolset-mcp tool-contract-mcp batch-changes-mcp
pnpm --filter @barocss/cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-studio-app build
node apps/cad-studio/test/revision-pinned-command-mcp.mjs "$WIRE_OUT"
cd apps/cad-studio
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$STUDIO_OUT" "$WIRE_OUT/mcp-bored-plate.bcad"
```

# D1429 — Bind feature deletion to a reviewed revision

P0 agent edit safety, rows 04 and 16, [#324](https://github.com/barocss/cad/issues/324). Base: `8b4e4174f949d57ab9491cb586c7d4ddbcb3d5c8`.

`features.delete` accepts `expectedRevision` from `query.render` or `query.rebuild` in the same part scope. It checks the revision before using the feature index. `DELETE_STALE` reports the requested and current revisions. Get the current index from the feature tree before resubmitting. The pin is optional for existing clients. Studio autonomy and proposal approval use the existing rules.

## Verification

- **FAIL, baseline.** In an actual stdio MCP session, a review of `n3` used index 3. Deleting the earlier box moved `n3` to index 1 and `n5` to index 3. The old API rejected the pin as an unknown argument. The unpinned request deleted the 1800 mm³ box `n5` at the reused index.
- **PASS, actual stdio MCP.** The two review images match their declared PNG hashes. Review A `b3180b5943c8cecc` refused against B `e18c8371afc09c99` with `DELETE_STALE`. A malformed pin returned `DELETE_INPUT`. A batch with an earlier edit refused at the stale delete and rolled back the earlier edit. All refusals preserved the saved bytes. A fresh B request removed `n3` and kept `n5` at 1800 mm³. Replaying the B pin could not delete the surviving body at the now-reused index 1.
- **PASS, actual desktop Studio.** The chat server and MCP ran with a scripted provider. The stale request produced an error and no new model state. The original document, History controls and both native boxes stayed. At default autonomy L2 the current request still needed a proposal. Explicit acceptance of P1 removed the 1000 mm³ box. The retained (15 × 12 × 10) mm box had eight expected corners and a native volume of 1800 mm³. Undo restored both bodies. Redo, Save and fresh Open retained the accepted box. No page errors, console errors or watched source changes were recorded.
- **PASS, affected checks.** 47 Model and 7 Studio tests, scoped lint, Model type-check, Studio production build and generated agent tool table check. Discovery stayed at 13 tools and the per-turn discovery and prompt total fell from 24999 to 24996 characters.
- **FAIL, intermediate.** The first focused test expected the scoped dispatcher to skip even its read of the unchanged placed part. The corrected test records the single read and no candidate evaluation. The batch fixture then needed an async evaluator. The first Studio harness could not launch the scripted executable directly. The final run used the same fixture through a wrapper with the selected Node executable.
- **NOT_RUN.** Paid or external AI clients, mobile, full local suites and whole-issue acceptance. #324 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during the desktop flow and store the wire replies and screenshots outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs revision-pinned-delete revision-pinned-edit revision-pinned-command batch-changes proposals toolset tool-contract views
node apps/cad-studio/scripts/test.mjs toolset-mcp tool-contract-mcp batch-changes-mcp approval
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/cad-studio/test/revision-pinned-delete-mcp.mjs "$WIRE_OUT"
cd apps/cad-studio
REVISION_DELETE_FROZEN=1 node test/revision-pinned-delete-browser.mjs "$STUDIO_OUT" "$WIRE_OUT"
```

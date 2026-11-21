# D1525 — Pin an Agent Smooth Turn angle edit to the reviewed revision

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#324](https://github.com/barocss/cad/issues/324). Base `a46797338743070099c8f962ce4d2b746702fd05`.

The local Agent must pass the current `expectedRevision` when it uses `features.edit` with `values.smoothTurnAngle`. The edit accepts the angle alone and validates the existing station count before evaluating the candidate. L1 can propose the edit. Studio owns approval.

- **PASS, actual local MCP.** Independent renders of the saved −450° and +360° parts at 70 mm returned distinct revisions `29c8bcfcf2b596f2` and `f023a45a8b1b6f22`. The PNG bytes matched the reported SHA-256 values. A missing revision, the earlier visual revision, 451°, L1 direct write and L1 acceptance were refused. The current file bytes stayed exact through the rejected calls. The earlier file also stayed exact.
- **PASS, desktop Studio and native read.** Preview and explicitly approve the proposal at the current revision, reversing +360° to −360°. The part keeps its 16 stations, one strict closed solid, six faces, 12 edges, body and topology IDs, and original Loft node. The four rails pass the independent positions at all stations and the signed derivative check. Both volumes agree within 1e-7 mm³ at 6720.19295120384 mm³. Undo, Redo, native Save and fresh Open pass. History shows −360° and 70 mm, and the reopened native digest exactly matches the approved result.
- **PASS, affected checks.** 34 Model and 25 Studio tests, scoped lint, Model types, Studio build, generated tool inventory, browser syntax and Git diff. The Model test covers a copied station shared with another consumer. The existing Hole revision-pin MCP driver passes as a control.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Full local suites, other browsers, mobile, paid live Agent sessions, and broader review-linked operations. Both issues remain open.

Run with Node 22.19.0, installed Chrome and Playwright. Gate heavy work and keep raw receipts and screenshots outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-turn-angle revision-pinned-command tool-contract toolset proposals
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability history-feature-apply
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/src/chat/toolDefinitions.ts packages/barocss-cad-model/test/smooth-turn-angle.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_TURN_PIN_FROZEN=1 node test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/angle" "$D1523/smooth-turn-height-70.bcad" "$D1524/smooth-turn-positive-360.bcad"
node test/revision-pinned-command-mcp.mjs "$EVIDENCE/hole-control"
```

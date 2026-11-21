# D1541 — Pin an Agent Smooth Turn width edit to its visual review

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#324](https://github.com/barocss/cad/issues/324). Base `78b143b9e25ffc7026d5c975142939374fb905fb`.

`features.edit` accepts `values.smoothTurnWidth` alone in mm with the current `expectedRevision` from `query.render` or `query.rebuild`. It uses the existing terminal Smooth Turn History field and its bounds. The local Agent at autonomy 1 can propose this edit. Approval belongs to Studio.

- **PASS, actual local MCP.** Saved 12 and 16 mm turns share their node IDs and output keys. The two review images match their reported SHA-256 values and return distinct revisions `42b61ca061683717` and `2c0cf80e7da957dd`. Missing and stale pins, direct L1 edit and approval, a mixed angle edit, zero and an unchanged width are refused. The input file stays byte-identical through the refusals before the proposal. A valid pending proposal preserves the feature nodes until approved.
- **PASS, actual desktop Studio.** Preview the proposed 16 to 20 mm width change and verify that the accepted part stays at 16 mm. The UI reports +1280.16 mm³ of added volume. Click Accept and verify the user approval record. Undo, Redo, native Save and fresh Open pass. History shows 20 mm width, +360° angle and 40 mm height.
- **PASS, independent native checks.** All four rails match the 20 × 8 mm rectangular corners at all 13 stations within 1e-8 mm. The strict solid retains six faces, 12 edges, stable output key and the original direction. The Ruled Turn control digest agrees exactly. The Smooth Turn volume changes from 5120.658557985098 to 6400.823197481391 mm³, matching the independently computed 20/16 ratio within 1e-7 mm³. Reopening retains the exact approved Smooth Turn digest. Both desktop runs have zero runtime, console and frozen-source changes.
- **PASS, affected checks.** The earlier angle-edit MCP and desktop control passes. 37 Model and 25 Studio tests, scoped lint, Model and Studio types, Studio build, Agent inventory, browser syntax and Git diff pass.
- **FAIL, corrected control setup.** Two control launches used stale file locations for the prior angle evidence. The final run uses the existing D1524 height-control and candidate saves.
- **NOT_RUN.** Full local suites, mobile, external live Agent sessions, other renderers and STEP output. Both issues stay open.

Run with Node 22.19.0, installed desktop Chrome and Playwright. Gate heavy work and keep screenshots and raw receipts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-turn-angle revision-pinned-command tool-contract toolset proposals
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability history-feature-apply
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/src/chat/toolDefinitions.ts packages/barocss-cad-model/test/smooth-turn-angle.test.ts apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/width" "$D1538/original-smooth-turn-width-12.bcad" "$D1538/smooth-turn-width-16.bcad" --width
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/angle-control" "$D1524/height-control/smooth-turn-height-70.bcad" "$D1524/candidate/smooth-turn-positive-360.bcad"
```

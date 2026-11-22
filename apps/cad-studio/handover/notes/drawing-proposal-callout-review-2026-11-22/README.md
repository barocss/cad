# D1689 — Compare printable drawing callouts before proposal approval

Automation/B06 and Agent revision review, rows 04, 09, 11 and 16. [#322](https://github.com/barocss/cad/issues/322) and [#324](https://github.com/barocss/cad/issues/324). Parent `30632c5fab05d62438108c33c243f98b9cbbd0fb`. The Studio fixture and SVG oracle come from [D1688](../drawing-printable-callouts-2026-11-22/README.md).

## Contract

`proposals.list` publishes a `proposalRevision` for each open proposal. It hashes the saved proposal, including its operations and authoring revision. To compare a sheet, pass `review: { proposal, expectedRevision, expectedProposalRevision }` to `drawing.dimensions`. Use the working sheet read's revision and the chosen proposal's pin. The working sheet stays at the top level. The candidate is read from the same isolated replay as Studio preview and carries its own sheet number, drawing source, revision and literal callouts.

The comparison follows a continuation sheet's saved ID if the candidate reorders the sheets. A removed sheet, stale source, different proposal pin, wrong working sheet pin or closed proposal returns a refusal. The query keeps the part, drawing, approval and history unchanged. The original call without `review` keeps its previous result.

## Verification

- **FAIL, parent reproduction.** The working document read returned a depth of 4 mm for Sheet 2 d4. The same call rejected a proposal argument as unknown.
- **PASS, local L1 MCP and desktop Studio WebGPU.** Two pending proposals start on the same drawing. P1's working and candidate callouts on Sheet 2 report `Ø4 THRU  CBORE Ø8 × 4 DEEP` and `Ø4 THRU  CBORE Ø8 × 2 DEEP`. Sheet 1 has no callouts in either state. The source marks are `8ca4d80d41e58a57` and `0a9dd9d36631c69b`. Both candidate sheet revisions, the Sheet 2 source and literal text agree with the approved native file after Studio Save and fresh Open. The browser checked five XML exports and 12 captures. Test reads preserved exact native bytes. The reopened file SHA-256 was `fda8dfd7dd2eddce5f615dbeb2d34e7e5b147d8f51a5643407e90bc3f00c4024`. The Model-only preview retained the working depth and gave a +75.4 mm³ volume change. L1 acceptance was refused and Studio recorded one explicit user approval.
- **PASS, negative controls.** The real P2 pin cannot read P1. The Sheet 2 pin cannot read Sheet 1. An unknown proposal, accepted P1 and the remaining stale P2 refuse without returning candidate data. Studio also shows P2 as stale. The focused replay check follows the same sheet from number 2 to number 3 and refuses when the proposal removes it. A separate temporary bundle that reverted to ordinal matching failed this regression as expected.
- **PASS, scope checks.** Independent review caught the ordinal-only pairing, and the sheet-ID change has a focused regression. Scoped lint, model types, 39 focused model tests, two MCP contract tests and the generated Tools table check pass. The 13-tool list and system prompt occupy 24,994 of 25,000 characters. The B01, B05 and B06 scripted references each pass 5/5.
- **FAIL, inherited documentation check.** The generated refusal inventory differs from existing kernel and model sources. D1689 tool refusals use response codes and leave those inventory entries unchanged.
- **NOT_RUN.** PDF, live provider and full local suites. Broad CAD and live provider success are unmeasured. B06 remains 6/7 groups and the first mechanical CAD baseline remains 8/10 accepted.

## Reproduction

Use Node 22.19.0, the installed desktop Chrome and Playwright, the workspace gate and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-stack-tool drawing-radius-read drawing-diameter-read toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-revision,b05-pin-mate-revision,b06-counterbore-drawing-revision
node apps/library-docs/scripts/agent-tools.mjs --check
D1689_SOURCE_FROZEN=1 node apps/cad-studio/test/counterbore-drawing-agent-revision-browser.mjs "$OUT/studio"
git diff --check
```

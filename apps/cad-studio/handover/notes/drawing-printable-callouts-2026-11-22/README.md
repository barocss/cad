# D1688 — Read the selected drawing's printable callouts from the Agent

Issue [#322](https://github.com/barocss/cad/issues/322). Automation/B06, rows 04, 09, 11 and 16. Parent `31376b83506906e2bb87e5fa746f491b4e8afe4e`. This extends the [D1687 frozen case](../b06-counterbore-drawing-agent-revision-2026-11-22/README.md).

## Contract

Call `drawing.dimensions` with `{ "sheet": 2, "include_callouts": true }`. The optional result contains the drawing `source` from the printed title block and a `callouts` array of `{ id, view, kind, lines }`. Each line is literal visible text from a resolved diameter or radius group on the selected sheet. This uses the drawing sheet marks that SVG exports. Callout text keeps its authored formatting and spacing.

The existing `revision` binds the document and one-based sheet. Default dimensions, opt-in geometric diameters and radii in model millimeters, and the linear-only tolerance stack keep their previous results. The grouped MCP wire contract still has 13 tools.

## Evidence

- **FAIL, parent MCP baseline.** On the approved file, the normal geometry lookup returned d4 as `4.000000000000001` mm. The printable callout option was rejected. The first implementation regression also found that the published action schema omitted the option. Both checks now pass with public option admission.
- **PASS, WebGPU desktop Studio and local L1 MCP.** Native Save and fresh Open retain the accepted counterbore and the same d4 Top owner. Sheet 2's literal MCP text matches the actual SVG text before and after approval, including both spaces after `THRU`. The drawing title block source changes from `8ca4d80d41e58a57` to `0a9dd9d36631c69b`, and each sheet has its own document revision. Sheet 1 returns zero callouts in both states. The latter SVG retains the paper radii of 2 and 4 mm. The accepted depth is 2 mm and the native solid volume is 38173.80532894145 mm³. Reads preserve the original fixture bytes and the approved native file with SHA-256 `913a0c45eca6563b1a90686cf0447320d0d7a71793f468e85c81544d6d475cc9`. Re-edit to depth 4 restores the original printed label. Eleven captures and five independent SVG oracles pass.
- **PASS, regression checks.** The D675 desktop control passes four actual SVGs. The frozen B01, B05 and B06 local references each score 5/5. 38 focused model tests and two MCP contract tests pass, along with the model type check, scoped lint and diff checks. Tools and system prompt total 24,985 of 25,000 characters.
- **NOT_RUN.** PDF, live provider and full local suites. B06 stays at 6/7 qualified groups. First mechanical CAD stays at 8/10 accepted. Whole CAD and live provider success are unmeasured.

| State | Sheet 1 | Sheet 2 Top, d4 |
| --- | --- | --- |
| Original depth 4 mm | Empty callouts | Ø4 THRU  CBORE Ø8 × 4 DEEP |
| Approved depth 2 mm, fresh Open | Empty callouts | Ø4 THRU  CBORE Ø8 × 2 DEEP |

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the workspace gate and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-stack-tool drawing-radius-read drawing-diameter-read toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-revision,b05-pin-mate-revision,b06-counterbore-drawing-revision
D1688_SOURCE_FROZEN=1 node apps/cad-studio/test/counterbore-drawing-agent-revision-browser.mjs "$OUT/studio"
D675_SOURCE_FROZEN=1 node apps/cad-studio/test/two-sheet-counterbore-svg-browser.mjs "$OUT/legacy"
git diff --check
```

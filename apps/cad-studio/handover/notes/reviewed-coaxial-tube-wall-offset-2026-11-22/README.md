# D1599 — Propose a reviewed inner wall Offset on a coaxial tube

P5, row 31, [#322](https://github.com/barocss/cad/issues/322) and [#629](https://github.com/barocss/cad/issues/629). Base `5bbacc1fad73a93fd85e6cfa1c76ea65930ed3bb`.

The local Agent can discover and edit `values.offsetDistance` on the terminal inner wall Offset of one supported upright coaxial tube. The request supplies only this signed mm field and the current `expectedRevision`. Discovery requires an evaluated native bore on the exact output. The existing History command builds the candidate, and the normal evaluator validates it. At autonomy 1, the Agent creates a proposal for explicit Studio approval.

- **PASS, local MCP and desktop Studio WebGPU.** Review distinct −1 mm and +1 mm saved states. Refuse missing and stale revisions, combined fields, zero, bore collapse at +4 mm and outer wall contact at −5 mm. Each refusal keeps the input file byte-for-byte. A direct change and Agent-side approval are refused at autonomy 1. The pending −2 mm proposal leaves the accepted nodes and output intact. In Studio, Preview retains the exact accepted document. Accept records the user decision. Undo restores +1 mm, Redo restores −2 mm, and native Save and fresh Open preserve the accepted document. History still opens for editing.
- **PASS, independent geometry.** The saved change takes the bore from R3 to R6 with the outside R9 cylinder, Z0 and Z16 caps and (14, 9) mm axis fixed. For π × (81 − r²) × 16, native and Studio volumes agree at 3619.1147369354435 mm³ before and 2261.9467105846597 mm³ after. Maximum volume error is below 1e−11 mm³. Owner IDs do not change. Fresh Open reproduces the accepted native digest `fc97208a5dee94c01d90b4a731a2d306605e5ddb5ad5cd5a93bdc10ac12cda59`.
- **PASS, affected checks.** 37 Model and 23 Studio tool tests, Model and Studio types, scoped lint, production build, driver syntax and Git diff. Model checks preserve the existing drafted-wall edit and reject unrelated radial or nonterminal Offset recipes. The frozen product run covered 1163 source files with zero file changes, runtime errors and console errors.
- **FAIL, corrected first harness assertion.** The first driver expected each native limit in the proposal response. The existing proposal layer returns a generic build refusal. The final browser verifies refusal and byte retention for both values. The Model tool test verifies the two exact native causes in its structured detail.
- **NOT_RUN.** A new drafted-wall desktop run, other renderers, exchange, live agent providers, mobile and full local suites. #322 and #629 remain open.

Use Node 22.19.0, installed Chrome and Playwright, and a signed +1 mm fixture from the D1597 desktop run. Prepare the older local fixture by changing only the signed distance to −1 mm. Gate the run and keep the evidence outside Git.

```sh
pnpm --dir packages/barocss-cad-model test offset-face-native
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/features.ts,toolDefinitions.ts} packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/saved-wall-agent-browser.mjs
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal
pnpm --dir apps/cad-studio build
jq '.nodes[-1].distance = -1' "$FIXTURE" > "$EVIDENCE/older-tube-wall.bcad"
SAVED_WALL_AGENT_FROZEN=1 node apps/cad-studio/test/saved-wall-agent-browser.mjs "$EVIDENCE/studio" "$EVIDENCE/older-tube-wall.bcad" "$FIXTURE" --tube
node --check apps/cad-studio/test/saved-wall-agent-browser.mjs
git diff --check
```

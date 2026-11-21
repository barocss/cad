# D1568 — Qualify reviewed Agent authoring of triangular Smooth Screw

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `6453fc24018c4544f7d368a5e072c187dd33e27a`.

Add a triangular profile to the existing local MCP and Studio acceptance driver. Use one tilted straight triangle and an unused rectangle. Bind the operation to the triangle's sketch ID and the current part revision. Use −450° winding, 40 mm pitch and axis coordinates `(10, -3)` for a 50 mm advance. The fixture covers review, approval and recovery with the existing command.

- **PASS, local stdio MCP.** Discover the triangle contract through tool listing and description. Read the exact sketch ID and revision. At autonomy level 1, refuse direct mutation, missing or stale revision, an unknown sketch, an interior axis and MCP-side approval. The file remains exact before the permitted proposal. The permitted proposal records an open review and leaves the original source nodes and outputs exact.
- **PASS, stale Studio review.** Open the proposal in desktop Studio. Add a Box before review and observe the original proposal become stale. Preview is disabled and Rebase & preview is available. Undo restores the exact pending document.
- **PASS, desktop Studio approval and native equality.** Review the compact shape and switch to the Boolean Changes view and back. The review preserves the pending document and shows the refined 1,284 triangles over a 240-triangle canonical packet. Accept in Studio and record a user decision. Undo returns the exact pending document and Redo returns the exact approved document. Save and fresh Open match the approved native digest. Direct creation from the same source has identical nodes, outputs and native digest.
- **PASS, native geometry.** The approved part is one strict closed solid with five faces, nine edges and three cubic rails. All 16 stations agree within `1e-8 mm`, the rail angular derivative has the requested negative sign, and the measured volume is `1050.0612784061143 mm³`. The independent cubic section integral is `1050.0612784061159 mm³`. The approved, reopened and direct B-rep digest is `a4912cc63b85e1a80b4caead6a8668f265a18899dd9741a959f195ac342ecb87`.
- **PASS, existing profile controls.** The same driver passes rectangular Smooth Screw, centered rectangular Smooth Turn and Ruled Turn through local MCP and actual Studio.
- **PASS, affected gates.** 39 Model and 26 Studio tests, Agent inventory consistency, scoped ESLint, browser syntax and Git diff. All four desktop runs report zero runtime errors, console errors and frozen-source changes. The approved project bytes have SHA-256 `f2dcb4436f1aa695100d0cafe09b8035709936ceccc6d02ee47e7bdf544678d2`.
- **NOT_RUN.** Live model provider, actual rebase acceptance on a different revision, triangular STEP exchange, additional desktop backends and mobile. The change records acceptance for one bounded Agent operation. #630 and #322 remain open.

Run with Node 22.19.0 and installed desktop Chrome, Playwright and local stdio MCP. Gate each heavy run and keep captures, transcripts and model files outside Git.

```sh
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/triangle" --triangle
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/screw" --screw
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/smooth" --smooth
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/ruled"
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command revision-pinned-command tool-contract toolset
pnpm --dir apps/cad-studio test tool-contract-mcp toolset-mcp proposal-review-availability history-feature-apply
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm exec eslint apps/cad-studio/test/ruled-turn-agent-browser.mjs
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
```

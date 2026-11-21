# D1548 — Verify a reviewed Agent angle edit on a triangular Smooth Turn

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) and [#324](https://github.com/barocss/cad/issues/324) · Base 13f40f7872fe8832ef3dd6bde254f566cfa87953.

Use the already saved D1544 −450° and D1547 +450° projects with the same 16-station triangle at 50 mm. Use the existing local MCP proposal route at autonomy L1. The product implementation from D1547 suffices. Extend the browser verification with native signed stations in the tilted frame and complete topology IDs.

- **PASS, local MCP with actual desktop Studio.** Independently hash both returned visual PNGs and compare the response hashes. The old and current revisions are 8266b6a0ffcac250 and 70d3dce70d66223d. Both the revisions and rendered hashes differ. Reject direct feature edit, missing pin, stale pin, +451°, and tool-side proposal acceptance. The current −450° proposal opens in Studio and the document remains exact during Preview. The explicit Studio acceptance records the actor as user.
- **PASS, native result and reopening.** The 16 signed stations and their opposite winding match independent rotated coordinates and derivative sign at each station. The topology IDs, original sketch, Loft node and controls persist. Undo restores the pending proposal and Redo restores the approval. Native Save and fresh Open agree exactly. Volume is 1050.061278406116 mm³ and the approved and reopened native digest is f7ca47f91445638b850c7efa26fbfbb029fb7fb6b4fc65f51039e853b81a1d23. History shows −450° and 50 mm after Open.
- **PASS, affected checks.** 42 Model and 25 Studio tests, scoped ESLint, driver syntax and Git diff. The existing rectangular width review also passes through actual local MCP, Studio approval and native Save and Open. Both browser receipts report zero console errors, runtime errors or frozen-source changes.
- **FAIL.** No D1548 validation failures observed.
- **NOT_RUN.** Live model providers, general Twist shapes, the rectangular angle browser variant at this HEAD, local type and build for the browser-test-only change, and mobile. #630 and #324 remain open.

Run with Node 22.19.0 and the installed desktop Chrome and Playwright. Use the heavy gate and keep raw captures outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle revision-pinned-command tool-contract toolset proposals
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability history-feature-apply
pnpm exec eslint apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/triangle" "$D1544/smooth-triangular-turn.bcad" "$D1547/smooth-triangular-turn.bcad" --triangle
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/rectangle" "$D1538/original-smooth-turn-width-12.bcad" "$D1538/smooth-turn-width-16.bcad" --width
```

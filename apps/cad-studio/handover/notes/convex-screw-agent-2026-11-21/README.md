# D1574 — Qualify reviewed Agent creation of convex polygon Screws

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `ea32d3ba1cda2f0f1f6f6c78ab8cbf153cc9ec71`.

Advertise the measured polygon scope in the existing Smooth Screw command description. Select the explicit sketch ID and current part revision. The local Agent uses the same native command as direct Studio creation. The fixtures have one tilted polygon and a different rectangle. They use −450° winding, 40 mm pitch and local axis `(10, -3)` for a 50 mm advance.

- **FAIL, previous discovery.** The local MCP description lists rectangles and straight triangles. A valid pinned proposal for each new polygon already opens for review. The MCP leaves the source nodes exact and refuses stale revisions, an interior axis and MCP-side acceptance.
- **PASS, local stdio MCP.** Discover the supported convex polygon range. At autonomy level 1, direct mutation, a missing or stale revision, an unknown sketch and an interior axis are refused. A correctly pinned proposal preserves the source and remains pending. MCP refuses approval and the user decision is recorded in Studio.
- **PASS, actual desktop Studio.** Open each pending proposal. Add a Box and see the proposal become stale with Preview disabled and Rebase & preview available. Undo restores the exact pending project. Compare Shape and Boolean Changes in review. The Shape and reopened display report the same packet kind and triangle counts. Approve in Studio, then Undo and Redo. Save and reopen in a fresh Chrome context. Direct Studio creation from the same earlier sketch matches the approved nodes, outputs and native digest. Both runs have zero runtime errors, console errors and frozen source changes.
- **PASS, native geometry.** One strict closed solid in each case. Every rail has 16 cubic poles, matches its 16 authored points within `1e-8 mm` and winds in the negative direction at 121 samples. The independent volume calculation uses the outline area and a separately solved cubic rotation interpolant.

| Profile | Viewport triangles, canonical → review | Native volume (mm³) | Approved, reopened and direct native digest |
| --- | ---: | ---: | --- |
| Pentagon | 378 → 2140 | 1350.078786522149 | `382147588776af1afcab367bc07a08e3a8cccc00699cff88ed09ff82e20bb266` |
| Hexagon | 468 → 2568 | 2300.134228889583 | `608a0be9f70c89886b492551b4a1f7fbb084bfe3a895d5f2476d680a0f43f1b6` |

- **PASS, affected checks.** 44 Model tests, 26 Studio tests, Model types, Agent inventory consistency, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Live model provider, accepting a rebase on a changed part, polygon STEP exchange, mobile and full local suites. #630 and #322 remain open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and the local stdio MCP. Gate heavy runs and retain the captures, proposals and transcripts outside Git.

```sh
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/pentagon" --pentagon
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/hexagon" --hexagon
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command revision-pinned-command tool-contract toolset
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test tool-contract-mcp toolset-mcp proposal-review-availability history-feature-apply
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts apps/cad-studio/test/ruled-turn-agent-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
```

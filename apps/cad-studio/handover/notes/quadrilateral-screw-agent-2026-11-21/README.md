# D1579 — Qualify reviewed Agent creation of quadrilateral Screws

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `aa7f68e156baf1f4943941be0707848f604f225e`.

Update the local MCP command description to include convex four-sided polygon sketches. Use one tilted trapezoid or skew quadrilateral with an unused rectangle. The proposal binds the selected sketch ID and current part revision. Use −450° rotation at 40 mm pitch for a 50 mm axial advance.

- **FAIL, previous discovery.** The local descriptor lists 5 to 64 sides for convex polygons. A correctly pinned four-sided proposal can already reach review. The source stays exact and the existing runtime rejects stale revisions, an interior axis and MCP-side approval.
- **PASS, local stdio MCP.** Discovery describes 4 to 64 sides. At autonomy level 1, direct mutation, a missing or stale revision, an unknown sketch and the interior axis are refused. Each valid proposal leaves the source intact until the explicit Studio decision.
- **PASS, actual desktop Studio.** Add a Box and verify that Preview is disabled on the stale proposal. Undo restores the exact pending project. Inspect Shape and Boolean Changes, then approve in Studio. Verify Undo, Redo and fresh Open of the saved project. The Shape and reopened display report the same packet kind and triangle counts. Direct creation from the same sketch gives identical nodes, outputs and native digest. Both product runs have zero runtime errors, console errors and frozen source changes.

| Profile | Viewport triangles, canonical → review | Independent volume (mm³) | Approved, reopened and direct native digest |
| --- | ---: | ---: | --- |
| Trapezoid | 314 → 1712 | 1700.099212657521 | `a2744835b1ec73791e1bb8b07907d0e5d38bb7a5728e1fa3b757cd09dc43e710` |
| Skew quadrilateral | 290 → 1712 | 1225.071491473802 | `f3b7e16a9ec32a78a9edb46694498608e3ec386719b7481d985ef78fb78641d5` |

Each result is a strict closed six-face solid with four cubic rails. Each rail matches all 16 authored stations within `1e-8 mm` and has the requested negative winding at 121 samples. The native and independent cubic section integrals agree within `3e-12 mm³`.

- **PASS, affected checks.** 45 Model and 26 Studio tests, Model types, Agent inventory consistency, scoped ESLint, Studio build, browser syntax and Git diff.
- **NOT_RUN.** Live model provider, accepting Rebase & preview against a different revision, quadrilateral STEP exchange, mobile and full local suites. #630 and #322 remain open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and the local stdio MCP. Gate heavy runs and keep captures, transcripts and project files outside Git.

```sh
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/trapezoid" --trapezoid
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/quadrilateral" --skew-quadrilateral
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command revision-pinned-command tool-contract toolset
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test tool-contract-mcp toolset-mcp proposal-review-availability history-feature-apply
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts apps/cad-studio/test/ruled-turn-agent-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
```

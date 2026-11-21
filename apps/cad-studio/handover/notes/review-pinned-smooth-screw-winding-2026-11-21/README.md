# D1561 — Review signed Screw winding through the local Agent

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322) · Base 6375eb915852341bb7c59eb55024bdea0d88819c.

Discover `values.smoothScrewAngle` in the existing features edit action. Require one typed angle and the current part revision. Use D1560's field for the numeric and geometric admission. The evaluator must verify the selected feature's closed native solid. The reply carries the checked feature index. An ordinary evaluation cannot authorize the mutation. The proposal memo retains distinct entries for ordinary evaluation and each requested validation.

- **PASS, actual local MCP and desktop Studio WebGPU.** Refuse a direct L1 edit, missing and stale revision, mixed input, zero, excess angle, unchanged angle, and tool-side acceptance. Preview reversing the reviewed −360° Screw to +360°. Keep the accepted document exact until approval. The explicit user approval, Undo and Redo, Save and fresh Open all pass.
- **PASS, manual and Agent equality.** The source, axis, 16 axial stations, topology IDs, 56 mm pitch and 56 mm advance agree with the D1560 manual +360° result. Native volume is 5,376.154360963081 mm³. The manual, approved and reopened B-rep digest is `bb3d0e89d988d357f3895ca70f0eccc1e28ae467a51fa387bf73e3f2d5edb6da`. Preview and approved Model upload 1,302 vertices and 1,712 triangles at the same camera, with identical position digests. The pitch proposal control also passes. Both frozen runs report zero runtime errors, console errors and source changes.
- **PASS, affected checks.** 49 Model and 26 Studio tests, both type checks, Studio build, Agent inventory, browser syntax and Git diff. Scoped ESLint reports zero errors and the existing `no-explicit-any` warning at the local MCP message handler. The toolset budget stays at 24,832 of 25,000 characters.
- **FAIL, corrected during development.** The first actual local MCP proposal refused the change because the memo wrapper dropped the native validation argument. It now forwards the request and keeps its result apart from ordinary and differently targeted evaluations. The response from a provider that omits the requested native verification still refuses the mutation.
- **NOT_RUN.** Hosted providers, other evaluator hosts, WebGL2 for this Agent edit, STEP or other neutral exchange, arbitrary profiles and full local suites. Both issues remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy operations and keep evidence outside Git.

```sh
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features.ts,chat/toolDefinitions.ts,chat/toolKit.ts,chat/tools.ts,engine/evalMemo.ts,engine/evaluate.ts,engine/meshWire.ts} packages/barocss-cad-model/test/{smooth-screw-command.test.ts,evalMemo-ownership.test.ts} apps/cad-studio/{server/cadMcp.ts,src/engine/client.ts,src/engine/engine.worker.ts,src/state/useProposalPreview.ts,test/smooth-turn-angle-agent-browser.mjs}
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle revision-pinned-command tool-contract toolset evalMemo-ownership
pnpm --dir packages/barocss-cad-model type-check
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/winding" "$D1560/native-positive360-doc.bcad" "$D1560/smooth-screw-negative360.bcad" --screw-winding
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/pitch-control" "$D1552/agent-approved-smooth-screw.bcad" "$D1556/smooth-screw-pitch-56.bcad" --screw
pnpm --dir apps/cad-studio test tool-contract-mcp toolset-mcp proposal-review-availability history-feature-apply
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
```

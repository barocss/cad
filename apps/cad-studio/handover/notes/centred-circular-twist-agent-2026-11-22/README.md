# D1589 — Review a centred circular-segment Twist through the local Agent

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `6efa86462a85b872b171efeef7a0a6e92b37e608`.

Expose D1588 creation through the revision-pinned local Agent route. Describe the line-and-arc sketch, fixed area centroid and nonzero angle. Use the same native evaluator in Agent and Studio.

- **FAIL, previous local MCP.** The same circular-segment creation proposal returned the Studio-only scope error. Disk bytes stayed exact and fresh Studio Open showed the two original sketches and no body.
- **PASS, local stdio MCP at autonomy 1.** Discover the command and earlier sketch by stable ID. Reject immediate mutation, missing or stale revisions, an unknown sketch, a 0° circular turn and direct MCP approval. A current pinned proposal retains the working geometry.
- **PASS, actual desktop Studio WebGPU.** An intervening document change blocks stale preview and approval. Undo restores the exact pending proposal. Review Before and After and the +276.4 mm³ overlay. Explicit Studio approval creates the −450° Twist at 50 mm height. Undo, Redo, Save and fresh Open pass. Direct Studio creation from the same earlier sketch matches the approved feature nodes, outputs and native digest.
- **PASS, native and independent checks.** One closed strict solid has 5 faces, 9 edges and 3 cubic rails. The 121 samples per rail confirm the signed winding, authored station locations and axial advance. Native volume 276.39931201638285 mm³ agrees with the independent reference 276.39931201638126 mm³ within 1.6e-12 mm³.
- **PASS, affected checks.** 53 Model and 38 Studio tests, Model types, scoped ESLint, Studio build, browser syntax and Git diff. Final Studio source and console checks pass.
- **NOT_RUN.** Agent History angle editing, STEP round trip, paid or remote model execution, mobile and full local suites. #630 and #322 remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and retain native projects, screenshots and local MCP transcripts outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-turn-angle smooth-screw-command smooth-triangular-turn api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/smooth-turn-angle.test.ts apps/cad-studio/test/ruled-turn-agent-browser.mjs
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/studio" --centred-line-arc
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
```

# D1584 — Review a circular-segment Smooth Screw through the local Agent

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `3528b5b1d7456b621c91378fa5e3571fbe12b06f`.

Expose the D1583 creation command to the existing revision-pinned Agent route. Describe the standalone circular segment and supporting-disc clearance. Use the same native evaluator for Agent and Studio. Keep the separate scope for Agent pitch and angle edits.

- **FAIL, previous local MCP.** Proposal creation for the earlier circular-segment sketch returned the Studio-only scope error. The on-disk bytes stayed exact. Fresh Studio Open showed the two sketches and no body.
- **PASS, local stdio MCP at autonomy 1.** Discover the command and explicit source. Reject immediate mutation, missing or stale revisions, an unknown sketch ID, an interior axis and direct MCP approval. A current pinned proposal saves its plan and leaves the working geometry unchanged.
- **PASS, actual desktop Studio WebGPU.** Changing the document blocks stale Preview and Accept. Undo restores the exact pending document. The built-in Before and After review shows a +276.4 mm³ proposal with no committed body. Explicit user approval creates the −450° Screw with 40 mm pitch and 50 mm axial advance. Undo, Redo, Save and fresh Open preserve their expected documents. Direct Studio creation from the same earlier sketch yields the exact feature nodes, outputs and native digest.
- **PASS, native and independent checks.** The approved and reopened result is one strict closed solid with 5 faces, 9 edges and 3 shared cubic rails. The 121 samples per rail agree with the signed fixture and section stations. Native volume 276.3993120163785 mm³ agrees with the independent circular-segment integral of 276.39931201638126 mm³ within 3e-12 mm³.
- **PASS, affected checks.** 48 Model tests, 38 Studio tests, Model types, scoped ESLint, Studio build, browser syntax and Git diff. The initial browser attempt targeted the structured display's Changes control. The circular-segment test now exercises the ordinary Before and After review and volume overlay.
- **NOT_RUN.** Agent pitch and angle approval for this profile, STEP round trip, structured viewport refinement, remote model execution, mobile and full local suites. #630 and #322 remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and retain captures, native projects and local MCP transcripts outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/ruled-turn-agent-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
RULED_TURN_AGENT_FROZEN=1 node apps/cad-studio/test/ruled-turn-agent-browser.mjs "$EVIDENCE/studio" --line-arc
git diff --check
```

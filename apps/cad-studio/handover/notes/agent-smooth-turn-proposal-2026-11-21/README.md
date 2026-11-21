# D1522 — Propose Smooth Turn through local MCP

P5, row 07, [#630](https://github.com/barocss/cad/issues/630) and [#322](https://github.com/barocss/cad/issues/322). Base `7549664aab38c2b75674fda3f9cc6df70eec5d31`.

The local MCP `features.command` surface now exposes `smooth-turn` through the same authoring command as Studio. The explicit `values.sketch` names a standalone rectangle. The mandatory `expectedRevision` comes from the current part. The same admission checks apply during proposal replay. Ruled Turn continues through its existing recorded command path.

- **PASS, local MCP and desktop Studio.** Discover two distinct finished rectangles and target the earlier sketch. Direct write and acceptance refuse at autonomy 1. Missing or stale revision and unknown sketch refuse with the input bytes exact. Studio previews P1 and records explicit user approval for a −450° Smooth Turn at 50 mm. Undo, Redo, native Save and fresh Open preserve the accepted result.
- **PASS, independent geometry and direct Studio parity.** The accepted, reopened and manually authored documents produce the same nodes and outputs, one strict closed solid with six faces, twelve edges and four full-height cubic rails, and volume 4800.280129856528 mm³. The common digest is `02f76a8f799b341854a3d3bf4530ac1857e8c5bec4935d507ba6fbb11db385bf`. Sampled native points and derivatives preserve the negative turn and agree with the ideal corner coordinates within 0.016 mm. The second rectangle stays exact.
- **PASS, focused checks.** 54 Model and 25 Studio tests, scoped lint, types, Studio build, generated tool inventory, browser syntax and Git diff. The separate actual Ruled Turn control still passes. Tool list and prompt total 24,987 characters.
- **NOT_RUN.** Live provider, STEP, generalized profiles and rotation, full local suites and mobile. Both issues remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and freeze source writes during Studio. Keep actual screenshots, native files and transcripts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs revision-pinned-command ruled-turn-command toolset tool-contract proposals shop-context-tools script
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability history-feature-apply
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/features,part/history}.ts packages/barocss-cad-model/test/revision-pinned-command.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/ruled-turn-agent-browser.mjs
git diff --check
cd apps/cad-studio
RULED_TURN_AGENT_FROZEN=1 node test/ruled-turn-agent-browser.mjs "$EVIDENCE/smooth" --smooth
RULED_TURN_AGENT_FROZEN=1 node test/ruled-turn-agent-browser.mjs "$EVIDENCE/ruled-control"
```

# D1508 — Propose a world rotation around a current SubD cage vertex

P5, row 08, [#322](https://github.com/barocss/cad/issues/322). Base `f7c1b3a9d7a134aa60df87a0a554a895bcbc020a`.

`subd.rotate` reuses the base cage revision check and Studio's Model transform. Choose world X, Y or Z and a signed finite angle in degrees. Supply a current cage vertex ID or use the selection centre. A stale cage, invalid pivot or unsupported axis refuses. The change keeps the original cage topology, creases and mirror constraint. It uses the existing proposal and approval rules.

## Verification

- **PASS, local MCP and actual desktop Studio.** Find top face 90 and off-face vertex 78 at `[20, 40, 26]` mm in the same cage revision. Propose +15° about world Z. An invalid pivot, changed cage revision and placed request refuse. L1 rejects direct write and direct approval. Studio previews the proposal and applies the existing SubD feature after a user accepts it.
- **PASS, independent formula and strict native read.** The signed rotation matches the independent planar matrix within 7.11e-15 mm, against 1e-10 mm. The off-face pivot and all unpicked coordinates retain their exact values. Faces and creases are unchanged. Strict native validation and Studio agree on one solid. Native volume changes from 9044.223951787639 to 9054.528575847196 mm³. The accepted native digest survives fresh Open.
- **PASS, history, editing and files.** Undo/Redo preserve the proposal and approval states. In Studio, a later −15° edit about the same vertex returns the cage within 3.56e-15 mm of the original coordinates and keeps the original user decision. Both accepted and manually edited files reopen. The pending source file stays byte-identical.
- **PASS, focused and public contract checks.** 34 Model and 23 Studio tests, lint with two existing warnings, Model types, Studio types/build, browser syntax and Git diff checks. The generated tool table matches and the prompt/list total stays within the budget at 24,973 characters. Three mutations are caught: ignoring the explicit pivot, flipping the angle sign and removing the world-axis guard. Two independent source reviews pass. The actual D1507 scale workflow still passes.
- **NOT_RUN.** Actual Studio X/Y proposals, more cage families, paid/live Agent providers, alternate renderers, mobile and full local suites. #322 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy checks. Freeze worktree writes during actual Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cageTools toolset tool-contract proposals
node "$EVIDENCE/mutation-check.mjs" "$PWD"
pnpm --dir apps/cad-studio test toolset-mcp cage-transform-draft proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{cageTools,contract,groups,toolDefinitions}.ts packages/barocss-cad-model/test/cageTools.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/agent-subd-scale-browser.mjs
git diff --check
cd apps/cad-studio
AGENT_SUBD_ROTATE_FROZEN=1 node test/agent-subd-scale-browser.mjs "$EVIDENCE/rotate" --rotate
AGENT_SUBD_SCALE_FROZEN=1 node test/agent-subd-scale-browser.mjs "$EVIDENCE/scale-control"
```

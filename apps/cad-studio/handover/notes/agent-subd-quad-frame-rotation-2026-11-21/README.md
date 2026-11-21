# D1515 — Rotate one SubD quad around a local frame through MCP

P5, row 08, [#322](https://github.com/barocss/cad/issues/322). Base `06cebf9609343e6858687646cbe57d9deefa8fd8`.

`subd.rotate` now accepts `face`, `face-u` and `face-v` as axes. A local rotation requires one current convex planar quad. The Model uses the same frame as Studio. The normal follows the winding. U runs from the lowest vertex ID to its winding successor. V is normal × U. Pass a current cage vertex as pivot or use the selected face centre. The existing cage revision and proposal approval checks apply.

## Verification

- **PASS, actual local MCP and desktop Studio.** Open a SubD box tilted 15° around X and −18° around Y. Discover planar face 90 and off-face vertex 78. The Agent proposes +15° around the normal, +15° around U and −12° around V in separate runs. All three axes are oblique to the world axes. L1 rejects direct write and approval. A stale revision, a placed request, an invalid pivot and multiple faces refuse.
- **PASS, independent geometry and native files.** Project onto independent orthonormal coordinates and apply the signed planar rotation. Maximum cage coordinate error is 3.56e-15 mm. Every unpicked coordinate, face and crease remains exact. Strict native read confirms one solid for each axis. Volumes are 9054.528575847196, 8774.206788113084 and 9146.522023763922 mm³ for the normal, U and V cases, respectively, from 9044.223951787513 mm³. Actual Studio previews, user approval, Undo/Redo, Save and fresh Open preserve the accepted recipe. The opposite manual Studio angle about the same pivot restores the original cage within 3.56e-15 mm. The approval and reopened file remain editable.
- **PASS, focused and contract checks.** 45 Model and 25 Studio tests, lint with two existing warnings, Model and Studio types, Studio build, generated tool table, browser syntax and Git diff checks. The tool list and prompt stay within the existing cap at 24,989 characters. Three mutations are caught: replacing a local axis with world Z, replacing U/V with the normal and reversing the angle sign. Two independent source reviews complete. A world Z desktop control still passes.
- **PASS, broader Model controls.** An independently authored oblique two-quad cage verifies both signs for all three axes using both the centre and an off-face pivot. Mixed selection, warped quad, stale cage revision and invalid pivot refuse.
- **NOT_RUN.** Live model providers, other browsers, mobile and full local suites. #322 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work, freeze worktree writes during Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cageTools toolset tool-contract proposals cage-local-rotation
node "$EVIDENCE/mutants.mjs" "$PWD" "$EVIDENCE"
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp cage-transform-draft proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{cageTools,toolDefinitions}.ts packages/barocss-cad-model/test/cageTools.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/agent-subd-scale-browser.mjs
git diff --check
cd apps/cad-studio
for axis in face face-u face-v rotate; do
  AGENT_SUBD_ROTATE_FROZEN=1 node test/agent-subd-scale-browser.mjs "$EVIDENCE/$axis" "--$axis"
done
```

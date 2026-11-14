# D1295 — Propose an exact Sweep from a saved Direct curve

2026-11-15 · FEATURE · P5, rows 07 and 30

Local CAD agents can dry-run or propose the existing exact Sweep command. The part summary lists stable sketch IDs and visible Direct curve IDs with a revision of the source curve's degree, knots, control points and weights. The command requires a sketch ID, a path ID, the path revision and an explicit native representation. It copies one current Direct curve into the feature and creates a new body. The two supported profiles are a finished disk on one straight segment and a finished disk on one 30°–90° circular arc.

The proposal retains the sketch identity across History order changes. After a change to the same path ID's geometry, rebase requires a new proposal. Feature ID remapping leaves the Direct path ID and its revision intact. The existing Studio approval controls still own document mutation.

- **PASS — local MCP and desktop Studio.** Local stdio MCP discovered both modes. The straight and arc dry runs reported 412.208 and 394.784 mm³. Hidden, stale, missing and unsupported source or mode requests were refused. An L1 client could create a proposal but could neither mutate the part directly nor approve it. Studio refused to rebase after the geometry behind the same Direct ID changed. Reordering the two sketch nodes kept the requested sketch, and Studio showed its preview while the document had zero committed bodies. Accept produced a strict four-face native solid. History diameter edit from 4 to 6 mm, actual native Save, fresh Open and local MCP readback passed. The Worker and independent native evaluation agreed with the cylinder volume formula at 412.207604696 and 927.467110566 mm³.
- **PASS — checked code and production build.** Model type check, 45 focused Model tests, scoped ESLint, Studio production build and whitespace check passed.
- **FAIL, corrected.** The frozen v2 contract lacked the implemented edge-curvature query. The additive snapshot correction is already on main in `96b219260`. A browser test initially reused a locator from a closed page during proposal approval. The final run resolves the locator in the active page and measures both rebase flows.
- **NOT_RUN.** Arc proposal approval and file reopen, full local suites, hosted inference and mobile. Wider Sweep acceptance remains open in [#10](https://github.com/barocss/cad/issues/10).

## Commands and evidence

Node 22.19.0. The heavy gate serialized execution. The final desktop flow matched 910 frozen source files and recorded zero page errors, console errors and source changes. The final receipt SHA-256 was `bd7ff889d3cb3626118c0033e9831771cb7afa3c4ab5a89153d17d00dd56668c`. The native file SHA-256 was `0443f52b379d726bbf79e86cc9e6b22072079504f9ff3d8783486362c9473d6f`.

```sh
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test sweep-agent-remap text-remap text-relief-remap tool-contract toolset proposals
pnpm exec eslint packages/barocss-cad-model/src/chat/{contract,remap,sweepSource,toolDefinitions}.ts packages/barocss-cad-model/src/chat/part/{features,query}.ts packages/barocss-cad-model/test/sweep-agent-remap.test.ts apps/cad-studio/test/sweep-agent-proposal-browser.mjs
D1295_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-agent-proposal-browser.mjs <external-evidence>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```

# D1711 — Propose a saved sketch Fillet radius edit by side ID

P1 local Agent sketch edit, rows 04 and 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `1bc555a6fc1b279bc3a3751676265df57d340533`.

Read `sketchFillets` through `query.edit_fields` with `includeSketchCorners`. The result identifies each supported saved Fillet by its side ID and current radius in mm. A revision-bound `features.edit` can set one saved Fillet radius with `sketchRound: { sketch, fillet, radius }`. Use the D1710 local resize and the existing proposal workflow. Accept the pending edit in Studio.

## Verification

- **FAIL, base capability.** The local MCP description omitted the saved selector. Discovery on the D1710 part did not list its saved e5 Fillet. The proposal refused the request and kept the source bytes and empty proposal list.
- **FAIL, first browser driver.** The dry-run delta is calculated from body volumes rounded to 0.001 mm³. The initial assertion compared it to the unrounded native delta at 1e-7 mm³. The corrected test compares dry-run summaries within 0.001 mm³ and retains the exact native comparison after approval.
- **PASS, local MCP.** Discovery returned `{ fillet: "e5", radius: 6 }` with the current sketch ID and revision. The edit refused a missing or stale revision, the wrong side ID, mixed selectors, the current radius and a radius that consumes a carrier. Rejected requests leave the source bytes unchanged. A dry run reports one changed sketch and no write. The pending proposal preserves the R6 geometry. MCP refuses direct acceptance under the local approval policy.
- **PASS, desktop Studio WebGPU.** Preview Proposal P1, verify the original document and file, and explicitly accept. Native tangent endpoints `(40,22)` and `(32,30)`, original straight supports and exact face identities match D1710. Native volume is `11862.654824574367 mm³` and native body SHA-256 is `7681b66cb929f4b39a58e3018636f1da717bd5619ad21ec2b7be31c943a435bd`. Undo and Redo restore the exact pending and accepted states. Save and fresh Open reproduce the approved model. A read from the reopened file returns radius 8 on the same e5 ID and a new revision. Five desktop checkpoints recorded zero page errors, console errors and source changes.
- **PASS, affected checks.** 22 Model and 14 Studio tests, Model types, scoped ESLint, production Studio build and type check, driver syntax and Git diff check passed.
- **PASS, retained desktop controls.** The original local Agent Round proposal still supports one straight-side pair through approval and a post-open radius edit. The saved-Chamfer proposal reproduces its previous native geometry through approval and fresh Open.
- **NOT_RUN.** Full local suites, a live model provider, mobile and WebGL2. The local Agent contract covers the saved orthogonal Fillet profile. The first mechanical CAD baseline remains 8/10. Issue #21 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test revision-pinned-edit saved-chamfer-agent-edit sketch-fillet-edit tool-contract corner-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability draft-history
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/sketchCorner,part/features,contract,toolDefinitions}.ts apps/cad-studio/test/{sketch-point-drag,sketch-chamfer-agent}-browser.mjs
node --check apps/cad-studio/test/sketch-point-drag-browser.mjs
node --check apps/cad-studio/test/sketch-chamfer-agent-browser.mjs
D1711_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/verified" --radius-agent
D1693_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/round-control" round
D1701_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/chamfer-control" --agent-resize
git diff --check
```

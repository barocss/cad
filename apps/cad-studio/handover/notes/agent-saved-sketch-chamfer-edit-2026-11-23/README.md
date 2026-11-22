# D1701 — Propose a saved sketch Chamfer resize

P1 Agent editing, rows 09 and 16. [Issue #21](https://github.com/barocss/cad/issues/21). Parent `2be03867b156428713581d67910dd266db7b3708`.

`query.edit_fields` with `includeSketchCorners: true` exposes the side ID and current setback of each recognized saved Chamfer in `sketchChamfers`. In `features.edit`, pass the returned part revision, sketch index and sketch ID with `sketchChamfer: { sketch, bevel, distance }`. Use one selector. The edit resolves the exact saved tag and uses the same native setback edit as Studio. Existing local proposal and approval rules apply.

## Verification

- **FAIL, parent capability.** The actual local MCP on the saved C6/C6 fixture returned part revision `f8a1897e55901243` and gave no `sketchChamfers`. The existing proposal tool refused the bevel-only payload and left no proposal. The input file kept SHA-256 `b78c666bd346ce6272a95148c6af387fded6d239d790ea72f5c33ef9a8f98697`.
- **PASS, local L1 MCP.** The read returned e9/C6 and e10/C6 from the same revision in both text and structured content. A dry run on e9/C8 reported −140 mm³ and one changed sketch, n0. Direct editing and direct acceptance were refused at L1. Missing or stale pins, an ordinary side ID, mixed selectors, an unchanged size, a collapsed carrier and a detached parameter binding were refused without changing input bytes. The valid request staged one open proposal and kept the working geometry.
- **PASS, desktop Studio WebGPU.** The proposal preview shows the −140 mm³ removal. One explicit user Accept resizes the selected e9 while e10 remains C6. Undo restores the pending proposal and source geometry. Redo restores the accepted model. Save and fresh Open reproduce the native walls, carrier IDs and same 10 mm extrusion. The reopened local MCP reads revision `71d54a8250b3ae8a` and e9/C8 and e10/C6. It refuses the original revision pin. Seven desktop checkpoints recorded zero source changes, console errors or page errors.
- **PASS, exact native result.** Wall `n1.side[e9]` measures 8/8 mm and `n1.side[e10]` stays at 6/6 mm on their native carrier planes. The result measures 19860 mm³, with the exact D1700 Studio-edit B-rep hash `40b2dbef36d61300a322886b40ebb35f2705924408a483ec11c586c862e35c42`. The shared support intersection and the four native seam IDs survive the resize.
- **PASS, affected regressions.** Existing direct Studio resize, Agent single corner creation and grouped Agent visual review passed in actual desktop Studio. The local v2 contract has 13 tools and measures 24994 characters per turn. All 32 focused Model and 19 Studio MCP tests, Model and Studio type checks, scoped ESLint, production Studio build, driver syntax and diff check passed.
- **NOT_RUN.** Revision-pinned Agent image and native inspection for this pending resize, full local suites, mobile, live AI provider and the held B06 PDF. First mechanical CAD remains 8/10 and B06 remains 6/7. Overall completion is unmeasured.

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test saved-chamfer-agent-edit revision-pinned-edit corner-proposal-review sketch-chamfer-edit toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/chat/{contract,toolDefinitions,part/features,part/sketchCorner}.ts \
  packages/barocss-cad-model/test/saved-chamfer-agent-edit.test.ts \
  apps/cad-studio/test/{sketch-chamfer-agent-browser,sketch-chamfer-drag-browser}.mjs
node --check apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
D1701_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/agent-resize" --agent-resize
D1700_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/studio-resize" --resize
D1692_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/agent-create"
D1697_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent-review" --review
git diff --check
```

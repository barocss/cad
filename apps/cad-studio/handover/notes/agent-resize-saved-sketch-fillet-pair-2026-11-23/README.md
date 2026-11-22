# D1730 — Propose one radius edit for saved Fillets by side ID

P1 local Agent Sketch, rows 04 and 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `84b1b203feb1c4268dbf6092da5100c076c2287d`.

Use `query.edit_fields` with `includeSketchCorners` to read the radius and stable side ID of each saved Fillet. A revision-bound `features.edit` accepts `sketchRound: { sketch, fillets, radius }` for two or more saved orthogonal Fillets with the same initial radius. The tool applies the shared value to a private candidate, validates the final profile and commits it through the existing explicit Studio approval.

## Verification

- **FAIL, base capability.** Desktop Studio creates the saved R6 convex and reflex pair. Local discovery returns `e9` and `e10`, but the proposal rejects the pair selector and leaves the source bytes unchanged.
- **PASS, local MCP.** The tool schema describes distinct side IDs and a minimum of two. The proposal uses reversed IDs and refuses missing or stale revision, mixed selectors, duplicate and wrong side IDs, the current radius and a radius that consumes the shared carrier. No rejected call changes the file. A dry run changes one sketch with no write. Creating the proposal preserves the R6 geometry. Direct MCP acceptance is refused.
- **PASS, desktop Studio WebGPU.** Pending Preview leaves the accepted model at R6. Accept changes both arcs to R8. Undo and Redo recover the exact pending and accepted states. Save and fresh Open reproduce the approved native solid. Local readback finds both R8 values on the original IDs. Eight desktop checkpoints have zero source changes, page errors and console errors.
- **PASS, manual and native parity.** A real Studio drag generates the same independent native inspection output byte for byte as the Agent proposal after Open. Both walls retain the original IDs and radius 8 mm. The convex and reflex orientations, wall endpoints and strict 12-face solid pass. The independent volume is 20,000 mm³ and the native volume is 20,000.00000000002 mm³. The reopened B-rep hash is `35d8d87a5824c6461f7eee72212fd455ff41367f90ae5b6e873035b4a10164a4`.
- **PASS, affected checks.** 22 Model and 14 Studio tests, Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check. The earlier single-Fillet local proposal passes its desktop control.
- **NOT_RUN.** Full local suites, mixed input geometries, a grouped saved Chamfer proposal, live providers, mobile and WebGL2. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #21 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1730_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent" --agent-resize-fillets
D1726_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/manual" --resize-fillets
D1711_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/single-agent" --radius-agent
cmp "$OUT/agent/agent-R8-reopened.stdout.json" "$OUT/manual/both-R8-reopened.stdout.json"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test revision-pinned-edit saved-chamfer-agent-edit sketch-fillet-edit tool-contract corner-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability draft-history
pnpm --dir packages/barocss-cad-model exec eslint src/chat/{part/sketchCorner,part/features,toolDefinitions}.ts
pnpm exec eslint apps/cad-studio/test/{sketch-corner-batch,sketch-point-drag}-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-corner-batch-browser.mjs
git diff --check
```

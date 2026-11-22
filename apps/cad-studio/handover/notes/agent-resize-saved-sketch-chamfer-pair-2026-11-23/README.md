# D1731 — Propose one setback edit for saved Chamfers by bevel ID

P1 local Agent Sketch, rows 04 and 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `0503168c61064231538e821a727f7383ac1d79e0`.

Use `query.edit_fields` with `includeSketchCorners` to discover the stable bevel IDs and setbacks. A revision-bound `features.edit` accepts `sketchChamfer: { sketch, bevels, distance }` for two or more saved orthogonal Chamfers with the same initial setback. It validates each edit in the private candidate and presents the full result for explicit Studio approval.

## Verification

- **FAIL, base capability.** Desktop Studio creates the convex and reflex C6 pair. Local discovery finds `e9` and `e10`, but the proposal refuses the shared ID list and leaves the source bytes unchanged.
- **PASS, local MCP.** The schema offers the new grouped selector. The operation uses reversed IDs and refuses missing or stale revision, mixed selectors, duplicate and wrong IDs, the current distance and C13 on their shared carrier. Refusals and dry run keep the original file. The pending proposal retains the C6 model. Direct MCP acceptance is refused.
- **PASS, desktop Studio WebGPU.** Preview leaves both C6 setbacks intact until Accept. One Apply, Undo and Redo update both walls together. Save and fresh Open reproduce the approved body, and local readback finds the same two IDs at 8 mm. All eight checkpoints have zero changes to frozen source and zero page or console errors.
- **PASS, native and manual parity.** The approved model and real manual drag produce byte-identical native inspection output after Open. Both original planar bevel walls retain their side IDs, 8 mm setbacks and 9 mm shared carrier. The independent volume is 20,000 mm³. The valid native 12-face Extrude measures 20,000.000000000007 mm³. The reopened B-rep hash is `dd98e0ed9cbae3979de376209c6ed0d9baf02304d8644ca4aff021d185f31e64`. The preview depicts equal added and removed volumes of 140 mm³. Its net label displays signed rounded zero.
- **PASS, affected checks.** 22 Model and 14 Studio tests. Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check. The single-Chamfer and grouped-Fillet local proposals pass their desktop controls.
- **NOT_RUN.** Full local suites, mixed initial sizes, other sketch geometries, live providers, mobile and WebGL2. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #21 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1731_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent" --agent-resize-chamfers
D1728_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/manual" --resize-chamfers
D1701_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/single-agent" --agent-resize
D1730_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/fillet-agent" --agent-resize-fillets
cmp "$OUT/agent/agent-C8-reopened.stdout.json" "$OUT/manual/both-C8-reopened.stdout.json"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test revision-pinned-edit saved-chamfer-agent-edit sketch-chamfer-edit tool-contract corner-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability draft-history
pnpm --dir packages/barocss-cad-model exec eslint src/chat/{part/sketchCorner,part/features,toolDefinitions}.ts
pnpm exec eslint apps/cad-studio/test/{sketch-corner-batch,sketch-chamfer-drag}-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-corner-batch-browser.mjs
git diff --check
```

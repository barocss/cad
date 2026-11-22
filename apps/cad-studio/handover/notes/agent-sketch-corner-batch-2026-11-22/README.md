# D1696 — Propose several sketch corners as one edit

P1 sketch authoring and Agent tools, rows 04, 09 and 16. [Issue #21](https://github.com/barocss/cad/issues/21).

The existing `features.edit` accepts `corners` in `sketchRound` and `sketchChamfer`. Each pair comes from the current `query.edit_fields` result for the same sketched outline and revision. One size applies to all pairs. The edit uses the same atomic corner preparation as Studio. A duplicate corner, including the same pair in reverse order, or a pair outside the source outline is refused. The existing `sides` request still edits one corner. The grouped MCP tool list and native file schema stay the same.

## Verification

- **FAIL, parent capability.** At `c1375b497f71042e474660242dd31b3644a02c32`, local MCP discovered the saved pairs e3/e4 and e4/e5 under revision `5460b4f7068b13a2`. Both grouped corner proposals refused the request before a proposal was staged. The source file SHA-256 remained `da6d04d7c9e51668acc1dee70d45b549e2c31af72c27b4882905c708c11dd19f`.
- **PASS, local MCP.** The same pairs, in reverse request order and with one pair flipped, stage one P1 operation per fixture. Stale revisions, mixing `sides` and `corners`, duplicate or nonincident pairs and a 12.5 mm shared-side consumption case refuse. Dry run reports two additional faces and four vertices and omits the zero volume delta. Refusal and dry run preserve file bytes. The local L1 MCP cannot approve the staged operation.
- **PASS, actual desktop Studio WebGPU.** One explicit user Accept approved the R6 group. A separate P1 covered the 6 mm Chamfer group. Before acceptance the original document remained intact. In both cases the viewport shows the area added at the reflex corner and the area removed at the convex corner. The net volume stays at 20000 mm³. One document Undo restores the proposal and original geometry. Redo restores the group.
- **PASS, native geometry and persistence.** The original eight native wall IDs survived. R6 adds two quarter-cylinder walls with opposite orientations. The Chamfer adds two separate bevel planes. Strict closed B-rep checks and matched wall endpoints passed. Save and fresh Open restore both editable corners and reject the original source pin. The saved hashes are `bb643313fb3d8cf89ba94b7fa4a55205c3db7647fe49fcd571454b74bb5657a2` for Fillet and `cb6a77d223c1c5902b4d94acc196249dd047a721bd4deb692e7b677cd29bdc74` for Chamfer.
- **PASS, desktop regression.** The single-corner Agent Fillet and Chamfer and the manual two-corner Studio path passed.
- **PASS, local checks.** 50 model tests, 19 focused Studio and MCP tests, model and Studio type checks, Studio production build, scoped ESLint and diff check.
- **NOT_RUN.** The pending corner batch image in Agent review, live AI provider, mobile and the held B06 PDF. First mechanical CAD remains 8/10. B06 remains 6/7. Overall completion remains unmeasured.

The first browser runs treated an omitted zero delta as a number and expected the same number of selectable edge changes for the line–arc and planar shapes. The completed run checks the common face and vertex changes and uses strict native geometry for both results.

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test revision-pinned-edit corner-batch corner toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal-review-availability
pnpm --dir apps/cad-studio build
D1696_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent" --agent
D1693_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/single-round" round
D1692_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/single-chamfer"
D1695_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/manual"
git diff --check
```

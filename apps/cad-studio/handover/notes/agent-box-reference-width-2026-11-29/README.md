# D2257 — Match a Box width to a second native Box corner

P5 [row 04](../../roadmap-rows/04.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `481865e46`.

- **FAIL, base.** One original Box supported a named source corner and a numeric target X. A proposal naming an exact second Box corner was refused before evaluation.
- **Decision.** The revision-pinned proposal accepts `boxTargetVertexEdge` and `boxTargetVertexEndpoint` in place of `boxMaxX` for two independent original authored Boxes. The source endpoint belongs to the original +X wall of the first Box. The target endpoint belongs to a complete native edge of the second. Take its current X once and edit the original Box footprint. A direct call, stale revision, wrong owner, mixed or incomplete values, no-op, or width below 1 mm cannot apply. The existing approval and leave-out rules apply to both modes.
- **PASS, actual desktop.** MCP discovered source `[14.25, -4.5, 8.125]` mm and target `[32.75, 9, -2]` mm. The target edge's other endpoint was on X=39.75 mm. The proposal remained un-applied on disk, and the agent could not accept. Studio Preview and Hide preserved the original nodes. The user accepted the proposal. Undo, Redo, Project Save, Close, reload and Open passed. The run matched 1,639 frozen source files with zero console errors.
- **PASS, native geometry.** The source width moved from 12 to 30.5 mm. The fixed four vertices stayed on X=2.25 mm. The other four moved to X=32.75 mm with the same Y/Z. Native volume was 1,464 mm³ and centroid `[17.5, -0.5, 5.125]` mm. Strict checks passed for both bodies. Both authored Box commands and all feature IDs persisted. The target nodes and native result matched their original bytes. The reopened result matched the approved result.
- **PASS, affected checks.** Node 22.19.0 ran 48 focused Model tests and 19 focused Studio tests. Model and Studio types, changed-file lint, production Studio build and whitespace checks passed. Tools list and prompt total 24,965 characters against the current 25,000 limit. The first Studio test command used the wrong working directory for a fixture. The same tests passed from the Studio directory.
- **NOT_RUN.** Full local suites, other stock families or directions, assembled targets, mobile and live models. There is no persistent dependency between the Boxes. The wider direct-edit coverage in #629 stays open.

```sh
node packages/barocss-cad-model/scripts/test.mjs box-vertex-width-agent vertex-move-agent edge-rotate-agent proposals proposal-diff toolset tool-contract
(cd apps/cad-studio && node scripts/test.mjs proposal-review-availability proposal-history-focus proposal-drawing-callouts)
node node_modules/vite/bin/vite.js build apps/cad-studio --outDir "$OUT/dist"
git diff --check
```

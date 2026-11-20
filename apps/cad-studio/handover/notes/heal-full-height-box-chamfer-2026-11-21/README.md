# D1460 — Restore a sharp box corner by deleting its chamfer face

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `60b1e189a503b15efd1fd009e798622eacbab50a`.

**Delete face** accepts one constant full-height 45° planar chamfer of a straight rectangular extrusion. The kernel checks the authored edge, the selected face, both cap rails, its adjacent cardinal walls and equal positive legs. Extending the two wall supports restores their sharp intersection. The six surviving faces keep their names, IDs and supports. The rejoined edge takes the original sharp edge name.

## Verification

- **FAIL, baseline.** Actual Studio selected `n2.face` on the 11980 mm³ part. The command was unavailable. Stdio MCP at revision `9b92d267ac597ee3` refused the selected chamfer and kept the source bytes.
- **PASS, native kernel.** Four corner tests at 1, 2, 3 and 4 mm follow the independent `12000 − 5d²` mm³ formula. Each healed result restores 12000 mm³ and centroid `[20, 15, 5]` mm. Strict topology changes from 7 faces, 7 loops, 30 coedges, 15 edges and 10 vertices to 6 faces, 6 loops, 24 coedges, 12 edges and 8 vertices. The six original faces and their supports agree with the source. Wrong faces, mismatched edges, cap-edge chamfer and multiple chamfers refuse this route.
- **PASS, actual desktop Studio and stdio MCP.** One 2 mm bevel on a 40 × 30 × 10 mm box restores 12000 mm³ and the original sharp edge `n1.side0|n1.side3`. Both consumers refuse an unrelated plane. Undo restores the bevel. Redo, Save, fresh Open and fresh Open of the MCP-written file preserve the repaired native result. A saved signature with a wrong normal refuses and keeps the current part. The cylindrical boss and one-bore controls pass. All three final Studio receipts report zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 133 Kernel, 65 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and chamfers on other types of stock. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Create a 40 × 30 × 10 mm rectangle extrusion. Apply one 2 mm Chamfer to `n1.side0|n1.side3` and save `chamfer.bcad`. Make the boss control from [D1459](../delete-cylindrical-boss-top-2026-11-21/README.md). Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/heal-prismatic-chamfer,part/part-model}.ts packages/barocss-cad-model/src/{engine/doc,app/deleteFaceCommand,chat/part/features}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-chamfer" "$EVIDENCE/chamfer.bcad" chamfer
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-boss-control" "$EVIDENCE/boss.bcad" boss
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-bore-control"
```

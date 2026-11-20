# D1435 — Rotate a convex hexagonal prism wall in Top view

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `0c1a3b4f7448b3a487975afd3f0c4e04ba97f844`.

**Replace face** accepts a reference plane that changes the horizontal direction of a straight convex hexagonal prism wall. The wall can also tilt along Z. The kernel solves the four corners on the actual reference plane and the fixed neighboring supports. Both end sections must keep all six sides and the strict convex interior. Their affine interpolation keeps the same boundary between both caps.

## Verification

- **FAIL, baseline.** Actual desktop Studio preview and stdio MCP refused the exact plane rotated in Top view. Review revision `4a45e74a663fe77c` kept the original 3840 mm³ body and the file bytes.
- **PASS, native kernel.** The wall `4x − 3y = 72` was replaced by `4x − 2y = 72 + sz` for `s = 0` and `s = 4/5`. The changed corners follow the intersections with `y = 0` and `4x + 3y = 120`. With rotation only, the fixed section area is `1872/5` mm². With rotation and tilt, the areas at Z = 0, 5 and 10 mm are `1872/5`, `1918/5` and `392` mm². Those give volumes 3744 and `11504/3` mm³. Both cases keep the original 8 faces, 8 loops, 36 coedges, 18 edges, 12 vertices, all 36 pcurve IDs and the seven fixed support planes. Contact and crossing at either cap, adjacent-wall parallel, original-wall perpendicular and near-parallel donors refuse without changing the source.
- **PASS, actual stdio MCP.** Review revisions `5349fab3990f5e94` and `18dc0c5db2bf934c` gave summaries of 3744 and 3834.667 mm³ and kept the 192 mm³ donor. Stale replay returned `COMMAND_STALE` with each accepted file byte-identical.
- **PASS, actual desktop Studio on Chrome.** Both edits produced the same authored files as MCP. Native and worker volumes matched the independent volumes. The maximum initial pcurve and edge-to-surface gaps were below `1.3e-14` mm. Reference motion, History retarget, Undo, Redo, Save, fresh Open and exact MCP file Open passed for both. Moving the donor +2 mm in X gave 3920 and 3994.666667 mm³. Retargeted volumes were 3606.671843 and 3702.897826 mm³. Opening a saved corner collapse refused and kept the current document. Pure height tilt, hexagonal cap replacement and parallel Offset desktop regressions passed.
- **PASS, affected checks.** 53 Kernel, 30 Model and 40 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All five desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, other convex polygon counts and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in hex-wall-turn hex-wall-turn-tilt hex-wall hex-upper; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in hex-wall-turn hex-wall-turn-tilt hex-wall hex-upper; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

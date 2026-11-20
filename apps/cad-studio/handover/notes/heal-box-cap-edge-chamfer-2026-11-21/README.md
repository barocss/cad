# D1461 — Restore the sharp cap edge of a chamfered box

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `0fdb189054361ac7c151bce25942ac8b185b295d`.

**Delete face** accepts one constant full-width 45° chamfer between a box cap and side wall. It proves the six cardinal supports, both end walls, the original bevel face and the equal positive legs. The surviving cap and wall continue to their original sharp intersection. The native polyhedral result uses its existing trim representation and keeps the six face names and IDs.

## Verification

- **FAIL, baseline.** Actual Studio selected `n2.face` on both cap variants but refused Delete face. Stdio MCP at revisions `8c37e7ecb9d37780` and `e5adfbaae71bef08` kept the source bytes and the 11920 mm³ part.
- **PASS, native kernel.** The four side directions on both caps pass with a 2 mm equal-leg chamfer. Independent source volume is `12000 − 2L` mm³ for span `L` of 40 or 30 mm. Each healed result is 12000 mm³ with centroid `[20, 15, 5]` mm. Strict topology has six faces, six loops, 24 coedges, 12 edges and eight vertices. The original six face IDs and eleven other edge identities stay. The recovered edge takes the original sharp edge name. Unrelated faces and mismatched edges refuse. The original vertical chamfer tests pass.
- **PASS, actual desktop Studio and stdio MCP.** At the front top and front bottom, both cap orientations restore 12000 mm³ from 11920 mm³. The original sharp edge and six surviving face identities match. Both documents pass Undo, Redo, Save and fresh Open. The exact MCP file opens to the same native result. An unrelated plane and a malformed saved signature refuse. The full-height chamfer control passes. All three final receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 141 Kernel, 67 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and multiple or partial chamfers. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Create the rectangular stock from [D1460](../heal-full-height-box-chamfer-2026-11-21/README.md). Apply a 2 mm Chamfer to `n1.side0|n1.top` on one copy and `n1.bottom|n1.side0` on another. Keep the full-height D1460 input as a control. Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

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
for end in top bottom; do
  DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-$end" "$EVIDENCE/$end-chamfer.bcad" "chamfer-$end"
done
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-vertical-control" "$EVIDENCE/chamfer.bcad" chamfer
```

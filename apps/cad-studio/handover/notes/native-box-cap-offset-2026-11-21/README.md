# D1458 — Keep the original faces when offsetting a box cap

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `3f351b5fa7d24cc8c1c0b3876cf06a3838dd6237`.

An original Z-facing cap of a strict authored rectangular extrusion now uses a native signed **Offset face** feature. The moved plane continues the four fixed walls and rebuilds their trims. The existing cap, wall, edge and pcurve IDs stay. History opens the native feature with its signed distance. Existing three-node Offset files retain their file and History behavior.

## Verification

- **FAIL, baseline face identity.** Actual desktop Studio and stdio MCP at revision `4480092f416bbb33` both gave six faces and 7000.000000000001 mm³. The sketch, tool extrusion and Boolean changed all six native face IDs and changed the selected name from `n1.top` to `n3.top`. The changed topology reappeared after fresh Open.
- **PASS, native kernel.** For the 10 × 20 × 30 mm box, +5 mm gives 7000 mm³ and −5 mm gives 5000 mm³ by the independent box formula. Both cap orientations reproduce the expected supports and centroids. The strict solid has six faces, six loops, 24 coedges, 12 edges and eight vertices. All six face names and IDs, other topology IDs and pcurve IDs agree with the source. Exact contact at −30 mm and crossing at −31 mm refuse.
- **PASS, actual desktop Studio and stdio MCP.** Both cap orientations accept +5 mm, refuse −30 mm at the opposite cap and apply −5 mm in History. The original IDs survive both moves. Undo, Redo, Save, fresh Open and Open of the exact MCP-written file pass. The original legacy file opens at 7000 mm³ and edits to 6800 mm³ through its existing History. Both final receipts record zero page errors, console errors, source changes and pcurve gap.
- **PASS, affected checks.** 125 Kernel, 118 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and broader native cap classes. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Create a rectangle from `[0, 0]` to `[10, 20]` with `features.add`, then extrude sketch 0 by 30 mm. The optional legacy control is the same source followed by the saved +5 mm Offset from the base commit. Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-face-native native-offset-face native-offset-result offset-bored-cap offset-to-plane offset-drafted-wall offset-hexagonal-wall delete-bore-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/drafted-cap-offset,part/part-model}.ts packages/barocss-cad-model/src/{engine/doc,app/nativeOffsetFace,app/profileCommands,app/offsetFaceEdit}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
BOX_NATIVE_TOP_FROZEN=1 node test/offset-box-cap-browser.mjs "$EVIDENCE/studio-upper" "$EVIDENCE/box.bcad" upper "$EVIDENCE/legacy-box.bcad"
BOX_NATIVE_TOP_FROZEN=1 node test/offset-box-cap-browser.mjs "$EVIDENCE/studio-lower" "$EVIDENCE/box.bcad" lower
```

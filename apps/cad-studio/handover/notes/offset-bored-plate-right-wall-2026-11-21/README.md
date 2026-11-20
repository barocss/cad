# D1451 — Offset the right wall of a rectangular through-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `45953d92fc9c5dd3fede58184c11f75981ad461b`.

**Offset face** accepts a signed move of the exact X+ outer wall on a flat rectangular plate with one straight circular bore. The kernel identifies the wall from its native support and its four neighboring faces. It moves the outer boundary and continues the two cap charts. It rebinds the four affected cap-side bore pcurves to the new width. The exact cylinder and the remaining support planes keep their geometry and IDs.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP selected the X+ wall, then refused it as outside the supported cap profile. MCP pin `9ca6e80eae3bd52e` kept the original 11717.257 mm³ rounded volume and source bytes.
- **PASS, native kernel.** The 40 × 30 × 10 mm stock has a radius 3 mm bore at (11, 9) mm. At +5 mm the wall is at X=45 mm and the independent volume is `13500 − 90π` mm³. At −4 mm the wall is at X=36 mm and the volume is `10800 − 90π` mm³. The bore diameter is 6 mm in both directions. Both strict solids keep eight faces, ten loops, 36 coedges, eighteen edges, twelve vertices and all 36 pcurve IDs. Source and destination volume centroids match independent rectangle-minus-disc moments. A move to X=14.1 mm stays valid. Contact at X=14 mm and any tested overlap refuse.
- **PASS, actual desktop Studio and stdio MCP.** Studio drags the real normal handle to +5 mm and applies it, then edits to −4 mm in History. Both accepted documents match the exact MCP files. Native and worker volumes are 13217.256661176949 and 10517.256661176898 mm³. Attempting −26 mm refuses with the accepted outward model intact. Undo, Redo, Save, fresh Open and exact MCP file Open pass. Both signed MCP commands reject stale replay without changing accepted bytes. The upper and lower cap offset controls pass. Four desktop receipts have zero page errors, console errors and watched source changes.
- **FAIL, intermediate browser harness.** The first MCP reopen compared the serialized property order of the History-edited Studio file with the independently authored MCP file. The parsed documents were equal. The corrected run uses each file's exact representation and verifies the same native geometry.
- **PASS, affected checks.** 84 Kernel, 62 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, the other three exterior wall directions, and tilted or generalized stock. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run the heavy commands under the shared gate. Freeze the worktree during desktop verification and keep evidence outside Git.

Create the source file in a stdio MCP session with `features.add` using these three records. The fixture retains the native names `n1.side1` and `n2.side0`.

```json
[
  { "kind": "sketch", "profile": "rectangle", "min": [0, 0], "max": [40, 30] },
  { "kind": "extrude", "sketch": 0, "height": 10 },
  { "kind": "hole", "parent": { "node": 1, "side": "solid" }, "center": [11, 9], "radius": 3 }
]
```

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-bore-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,part/part-model}.ts packages/barocss-cad-model/src/{app/nativeOffsetFace,app/profileCommands,app/offsetFaceEdit,engine/doc}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-wall" "$EVIDENCE/bored-plate.bcad"
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$EVIDENCE/studio-upper-cap-control" "$EVIDENCE/bored-plate.bcad"
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$EVIDENCE/studio-lower-cap-control" "$EVIDENCE/bored-plate.bcad" --lower
```

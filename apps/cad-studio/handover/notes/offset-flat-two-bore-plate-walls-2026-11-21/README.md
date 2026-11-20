# D1453 — Offset the four walls of a flat two-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `2e4aecb337fdb6c9b1f096d4868766b540d4ab61`.

**Offset face** moves any cardinal outer wall of the flat rectangular plate with two distinct circular through bores. The kernel verifies both bore pairs and checks the inward limit against both exact discs. It continues both planar cap charts and rebinds their eight bore pcurves. All four cylindrical half-walls, their original axes and radii, and the other supports stay.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused all four named outer walls. MCP pin `ec326a75f2eca2e7` kept the original source and rounded volume 11591.593 mm³.
- **PASS, native kernel.** Source nominal dimensions are 40 × 30 × 10 mm. Bore centers and radii are (11, 9), 3 mm and (27, 20), 2 mm. Every wall supports +5 mm and −4 mm, and the exact inverse returns the same original B-rep. Interior radii and axes remain exact. The strict genus-2 result has ten faces, fourteen loops, 48 coedges, 24 edges, sixteen vertices and all 48 pcurve IDs. Each nearest-bore contact and a larger inward move refuse. A 0.1 mm clearance passes independently on each side.
- **PASS, actual desktop Studio and stdio MCP.** All four native handles move +5 mm. History applies −4 mm and refuses the contact case before replacing the accepted model. The accepted Studio documents match the MCP commands. Studio and native volumes, both diameters, and other supports agree. Undo, Redo, Save, fresh Open and exact MCP file Open pass. The one-bore wall control passes. All six desktop receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 91 Kernel, 62 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, tilted stock and stock with more than two bores. #17 remains open.

| Wall | +5 mm station | −4 mm station | Nearest contact | Independent +5 and −4 mm volumes |
| --- | ---: | ---: | --- | --- |
| X+ | X=45 mm | X=36 mm | X=29 mm at −11 mm, 4 mm bore | `13500 − 130π`, `10800 − 130π` mm³ |
| X− | X=−5 mm | X=4 mm | X=8 mm at −8 mm, 6 mm bore | `13500 − 130π`, `10800 − 130π` mm³ |
| Y− | Y=−5 mm | Y=4 mm | Y=6 mm at −6 mm, 6 mm bore | `14000 − 130π`, `10400 − 130π` mm³ |
| Y+ | Y=35 mm | Y=26 mm | Y=22 mm at −8 mm, 4 mm bore | `14000 − 130π`, `10400 − 130π` mm³ |

Use Node 22.19.0 and the existing Chrome and Playwright. Use the flat D1445 two-bore source. To make it from the D1451 fixture, add `{ "kind": "hole", "parent": { "node": 2, "side": "solid" }, "center": [27, 20], "radius": 2 }` with stdio MCP `features.add`. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-bore-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/features/bored-cap-offset.ts packages/barocss-cad-model/src/{app/nativeOffsetFace,app/profileCommands,app/offsetFaceEdit,engine/doc}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for side in Right Left Front Back; do
  BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-$side" "$EVIDENCE/two-bore-plate.bcad" "$side"
done
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-one-bore-control" "$EVIDENCE/bored-plate.bcad" Right
```

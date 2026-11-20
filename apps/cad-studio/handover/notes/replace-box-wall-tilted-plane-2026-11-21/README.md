# D1427 — Replace a box wall with a tilted reference face

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `b232da62d84eb35493e553cf8b8effaea17877ce`.

**Replace face** extends one cardinal wall of a straight rectangular extrusion to the exact plane of a separate reference solid. The plane tilts along Z, with a fixed wall coordinate at each cap. The other five supports stay. The solid retains its face, vertex, edge, loop and coedge IDs, names and pcurve IDs. The reference stays as a separate body and the recipe reads its live plane. Studio can retarget the reference in History. Offset face to plane keeps its parallel-plane contract.

## Verification

- **PASS, native Kernel.** Replacing the X-max wall of a 40 × 30 × 10 mm box with `x = 37 + z/2` yields 11850 mm³. The independently authored XZ trapezoid extruded in Y gives the same volume. Tests also qualify a reflected Y-min wall, compare native mass properties, verify all 24 pcurves and preserve incidence and names. The new path refuses wrong or stale names, a horizontal or parallel reference, transverse tilt, an out-of-range plane, and a replacement that reaches or crosses the opposite wall at either end.
- **PASS, local stdio MCP.** Render review `82f1b350cf3b7bbc` pins the pair `n1.side1`, `n3.side1`. The typed command returns 11850 mm³ for the box and 950 mm³ for the reference. Replaying the pin returns `COMMAND_STALE` and keeps the accepted file byte for byte.
- **PASS, desktop Studio.** The horizontal reference is refused with a direct explanation in the HUD. Picking the tilted face and applying yields the same document as MCP. Shifting the reference by +2 mm in X updates the linked box to 12450 mm³ without rewriting its replacement node. Retargeting to `n3.side3` in History keeps the feature ID and yields 9600 mm³. Undo, Redo, Save and fresh Open retain those two edited states. The exact MCP file also opens with 11850 mm³. The native reader and Studio worker match the independent volume at each step. The strict body has 6 faces, 6 loops, 24 coedges, 12 edges and 8 vertices. Its maximum edge-to-surface gap is 0 mm in the desktop witness. Opening a forged one-end collapse file leaves the accepted model and source file intact. The separate desktop parallel Offset workflow passed, including its nonparallel rejection. Both final flows report zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 37 Kernel, 28 Model and 40 Studio tests, scoped lint, generated agent tool table, Kernel build, Model type-check and Studio production build. Agent discovery plus the system prompt measured 24999 characters against the 25000 limit.
- **FAIL, base and intermediate.** The base Offset command refuses a nonparallel reference in actual MCP and desktop Studio, as designed. The first Replace face desktop run found that a horizontal rejection showed generic kernel advice. The final command reports the specific tilt requirement before a successful repick.
- **NOT_RUN.** Full local suites, WebGL2, mobile, STEP export and arbitrary tilted or curved face replacement. The broader #17 scope remains open.

Use Node 22.19.0 and local Chrome and Playwright. Run heavy commands in order under the shared gate and freeze source during desktop runs. Keep receipts and screenshots outside the repository.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/cad-studio/test/replace-face-mcp.mjs "$WIRE_OUT"
cd apps/cad-studio
REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$STUDIO_OUT" "$WIRE_OUT/box-and-reference.bcad" "$WIRE_OUT/mcp-replaced.bcad"
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$OFFSET_OUT" axis
```

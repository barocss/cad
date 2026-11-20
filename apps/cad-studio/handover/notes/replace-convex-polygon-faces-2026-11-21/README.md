# D1436 — Replace caps and walls of straight convex polygon prisms

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `ce925b50c1bf3ed795ddbc9ca7fcb6edde272bdf`.

**Replace face** uses the same exact cap and wall operations for a triangular prism or a straight convex polygon prism with at least five sides. The strict native proof requires two planar caps, vertical original rails, convex section and the matching affine walls. For `n` sides, it certifies `n + 2` faces and loops, `6n` coedges, `3n` edges and `2n` vertices. The topology counts and all IDs stay after the edit. The bound follows the author's existing 1024-point limit. Rectangle and draft replacement and the hexagon Offset route keep their existing scopes.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused a five-sided extrusion's exact top cap. Review revision `02af2b494b434d78` kept the original 3360 mm³ body and file bytes.
- **PASS, native kernel.** The pentagon footprint has area 336 mm² and centroid `(74/7, 8)` mm. Plane `z = 8 + x/10 + y/5` gives volume `17904/5` mm³ and centroid `[4077/373, 9368/1119, 120487/22380]` mm. The heptagon adds an 8 mm² triangle to the fixed side of the hexagon witness. Replacing its right wall with `4x − 2y = 72 + 4z/5` adds 80 mm³ to that witness's volume, giving `11744/3` mm³. Strict results kept the six or eight other supports and all 30 or 42 native pcurve IDs. The triangular cap and wall gave 1392 and 1531.875 mm³, respectively. One-corner contact refused on each desktop fixture. A four-sided polygon and concave or drafted polygon stock stayed outside the new native route. The signed hexagonal Offset case still passed.
- **PASS, actual stdio MCP.** Review revisions `4d9b17dc1ec3874c` and `75959c32e62ac371` gave 3580.8 and 3914.667 mm³, with both 192 mm³ reference bodies intact. Replayed review revisions returned `COMMAND_STALE` without changing the accepted bytes.
- **PASS, actual desktop Studio on Chrome.** Each Apply matched its MCP document. Native and worker volumes matched the independent section and corner measurements, with initial edge-to-surface and pcurve gaps below `1.3e-14` mm. The moved reference gave 4252.8 and 4074.666667 mm³. Retargeting kept the history feature IDs and gave 5285.692637 and 3782.897826 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. A file that collapsed the part was refused with the current document unchanged. Desktop regression checks covered the hexagonal cap and turned wall, box cap, drafted wall and parallel Offset.
- **PASS, affected checks.** 56 Kernel, 30 Model and 40 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All seven desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, the 1024-point limit, four-sided polygon and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in pentagon-upper heptagon-wall hex-upper hex-wall-turn-tilt upper drafted-wall; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in pentagon-upper heptagon-wall hex-upper hex-wall-turn-tilt upper drafted-wall; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

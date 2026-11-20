# D1433 — Replace either cap of a convex hexagonal prism

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `d0ef5bc54fb6937008e3afbfdd01591afd12d251`.

**Replace face** accepts either exact cap of a straight convex hexagonal extrusion. The selected plane intersects the six existing vertical edge lines. The six side wall supports and the opposite cap stay fixed. Each edge, vertex and trim interval keeps its original identity. The existing recipe uses the live reference face.

## Verification

- **FAIL, baseline.** Desktop Studio and stdio MCP both refused Replace face on `n1.top` of the authored six-point extrusion. The original volume was 3840 mm³. The MCP preview revision was `4c6026da5d32b0fe` and the source file bytes stayed the same.
- **PASS, native kernel.** The test footprint is `[(0,0),(18,0),(24,8),(18,16),(0,16),(-6,8)]` mm. The upper plane is `z = 8 + x/10 + y/5`. The lower plane reflects it about `z = 5`. The footprint has area 384 mm² and centroid (9, 8) mm. Integrating the affine thickness gives 4032 mm³ for both caps. The centroid is `[332/35, 376/45, 8363/1575]` mm for the upper replacement, with the lower Z reflected. Strict validation kept 8 faces, 8 loops, 36 coedges, 18 edges, 12 vertices and all 36 pcurve IDs. A one-corner touch and crossing were refused before volume went to zero. Parallel, nearly parallel and perpendicular donors were refused. The route checks the native incidence and planes before editing.
- **PASS, actual stdio MCP.** The upper and lower review revisions `18b5c74d77faa8cf` and `69f71ccfce173c95` each produced a volume of 4032 mm³ and kept the 192 mm³ reference. Replaying either revision produced `COMMAND_STALE` with the accepted file byte-identical.
- **PASS, actual desktop Studio on Chrome.** Both edits produced the same document as MCP. Native and worker volumes matched the independent corner intersections. Moving the reference outward by 2 mm gave 4800 mm³. Retargeting to the opposite donor face kept the feature ID and gave 5980.448728 mm³. Undo, Redo, Save, fresh Open and Open of the exact MCP file passed. At the initial apply, maximum pcurve gaps were below `7.2e-15` mm and maximum edge-to-surface gaps were below `3e-15` mm. Opening a one-corner contact file was refused and the current document stayed. Separate desktop checks exercised the drafted wall, box cap and parallel Offset routes.
- **PASS, affected checks.** 48 Kernel, 30 Model and 40 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All five desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, hexagonal side wall replacement and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in hex-upper hex-lower drafted-wall upper; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in hex-upper hex-lower drafted-wall upper; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

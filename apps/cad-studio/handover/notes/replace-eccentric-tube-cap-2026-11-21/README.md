# D1442 — Replace a circular tube cap with one eccentric through bore

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `3675176f2bbd3c0bbad55c5bfbb6d9bff4928b00`.

**Replace face** accepts either planar cap of the straight circular tube when its single through bore has a parallel, displaced axis and clears the outside cylinder. The cap anchor lies in the material away from the bore. Both exact cylinder axes, radii and cap trim rings stay. The minimum axial gap for the edited tube and for the bore read uses the actual center and radius of the outer cylinder.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP selected the exact cap, then refused the tilted reference with `BAD_REFERENCE`. Review revision `67f85136a8363152` kept the original `1280π` mm³ and source bytes. The Studio reproduction confirmed the native reason under Kernel detail.
- **PASS, native kernel.** The radius 12 mm outer cylinder is centered at (14, 12) mm. The radius 4 mm bore is centered at (16, 12) mm. Integrating `z = 8 + x/10 + y/5` over the outer disc minus the displaced bore gives `1507.2π` mm³. The lower fixture reflects it about `z = 5`. The retained section centroid is (13.75, 12) mm, with variances 39.4375 and 40 mm². Both volume centroids match the independent first moments. The strict genus-1 result keeps six faces, eight loops, 24 coedges, 12 edges, eight vertices and all 24 pcurve IDs. The outer-center thickness 2.75 mm case has about 0.0667184 mm of outer-rim clearance and still reads diameter 8 mm. Exact outer contact refuses. The outward cylinder and incomplete or mixed wall selections cannot establish a bore diameter.
- **PASS, actual stdio MCP.** Revisions `bd63068bb398e6be` and `9658c23d72ce1286` both gave 4735.008 mm³ in the rounded summary and kept the 192 mm³ reference. Stale replay returned `COMMAND_STALE` with the accepted bytes intact.
- **PASS, actual desktop Studio on Chrome.** Both Apply results matched the MCP files. Native and worker volumes were 4735.008447587245 and 4735.008447583134 mm³. Both initial edge and pcurve gaps were below `1.6e-14` mm. The reference move and History retarget kept the feature IDs. Undo, Redo, Save, fresh Open and exact MCP file Open passed. A stored replacement that reached the opposite cap on the outer rim refused with the accepted document intact.
- **PASS, Studio Requirements and stdio MCP.** Both edited tubes and the flat eccentric control report radius 4 mm and verified diameter 8 mm. A deliberate 10 mm check fails with measured 8 mm. The separate reference body remains unknown. Actual controls keep diameter 8 mm on the coaxial tube and 6 mm on the rectangular plate.
- **PASS, affected checks.** 74 Kernel, 57 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All seven desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, and replacement on stock with multiple bores. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in eccentric-tube-upper eccentric-tube-lower tube-upper tube-lower bored-upper bored-lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in eccentric-tube-upper eccentric-tube-lower tube-upper bored-upper; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
for stock in eccentric-tube tube bored; do
  radius=4
  if [ "$stock" = bored ]; then radius=3; fi
  D1439_SOURCE_FROZEN=1 node test/tilted-bore-requirement-browser.mjs "$EVIDENCE/studio-$stock-diameter" \
    "$EVIDENCE/wire-$stock-upper/box-and-reference.bcad" \
    "$EVIDENCE/wire-$stock-upper/mcp-replaced.bcad" "$EVIDENCE/wire-$stock-lower/mcp-replaced.bcad" "$radius"
done
```

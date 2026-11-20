# D1438 — Replace a cap on a rectangular plate with one through bore

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `b0ca53ff56870843fc05722ea5c391fceb9ec3eb`.

**Replace face** accepts either planar cap of the strict native rectangular plate with one cylindrical through bore. An affine lift gives the exact ellipse where the replacement plane meets the cylinder. The surrounding wall supports and the original cylinder axis and radius stay fixed. Uniform side charts retain the plane and cylinder classifications. The lifted cylinder rims use exact rational cubic pcurves with their original IDs.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused the selected exact top cap. Revision `75180ac4f521fcac` kept the 11717.256661176918 mm³ original part and the file bytes.
- **PASS, native kernel.** The plate is 40 × 30 × 10 mm, with one bore at (11, 9) mm and radius 3 mm. The upper replacement plane is `z = 8 + x/10 + y/5`. The lower plane reflects it about `z = 5`. Integrating height over the rectangle minus the disc gives `15600 − 981π/10` mm³. Independent first moments agree with each native centroid. The strict result keeps genus 1, 8 faces, 10 loops, 36 coedges, 18 edges, 12 vertices and all 36 pcurve IDs. Native cylinder metadata and rim samples preserve a 3 mm radius and the Z axis at (11, 9) mm. One-corner contact refuses without changing the source. The existing bore Offset and Delete face kernel regressions passed.
- **PASS, actual stdio MCP.** Review revisions `803538060eaf4a6b` and `e59c37921d485665` both gave a 15291.81 mm³ body in the rounded summary and kept the 192 mm³ reference. Replays returned `COMMAND_STALE` and kept the file byte-identical.
- **PASS, actual desktop Studio on Chrome.** Both Apply results matched the MCP documents. The initial native quadrature and worker volumes were 15291.809760689808 and 15291.809760706525 mm³, with both gap metrics below `3.6e-15` mm. Rim samples satisfy both the reference plane and the retained original cylinder. Moving each donor outward by 2 mm gave 17635.261093 mm³. History retargeting kept the same feature IDs and gave 21237.2456565 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. Opening a replacement that reached the opposite cap at one corner preserved the current model. The straight box cap, drafted wall, trapezoidal wall and lower bored-cap Offset flows passed.
- **PASS, affected checks.** 64 Kernel, 30 Model and 40 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All six desktop receipts recorded zero page errors, console errors and source changes.
- **Known limit.** The dedicated `hole_diameter` check still requires two circular rims. It refuses the one-circular, one-elliptical result. The analytic cylinder radius is available.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export and Fit workflows. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in bored-upper bored-lower upper drafted-wall trapezoid-wall; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in bored-upper bored-lower upper drafted-wall trapezoid-wall; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$EVIDENCE/studio-offset" --lower
```

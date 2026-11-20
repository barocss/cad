# D1437 — Replace faces of nonrectangular convex quadrilateral prisms

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `5c5bc571c442ff141c46af298d83de7bdae0f1b1`.

**Replace face** accepts caps and side walls of a strictly admitted straight convex quadrilateral prism such as a trapezoid. The original trim vertex heights distinguish caps from side walls when all loops have four edges. The native rectangular path continues to handle rectangular boxes and rectangular tapers. Parallel Offset keeps its established admission.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused the exact top of the authored trapezoid. Review revision `ef1146924f3b1d29` kept the 3360 mm³ body and the source file bytes.
- **PASS, native kernel.** The footprint `[(0,0),(18,0),(24,16),(0,16)]` mm has area 336 mm² and centroid `(74/7,176/21)` mm. The new cap `z = 8 + x/10 + y/5` gives volume `18032/5` mm³ and centroid `[12399/1127, 9932/1127, 17489/3220]` mm. The new right wall `8x − 2y = 144 + 4z/5` meets the fixed caps and the Y-min and Y-max walls. Its section area `320 + 8z/5` gives 3280 mm³. The replacements keep the five fixed planes, six faces, six loops, 24 coedges, 12 edges, eight vertices and all 24 pcurve IDs. Exact corner collapse and a concave quadrilateral refuse. Physical rectangles keep the existing replacement route.
- **PASS, actual stdio MCP.** Review revisions `f980b8d526835798` and `ff3f4947690c3bed` gave 3606.4 and 3280 mm³, with each 192 mm³ reference unchanged. Stale replay returned `COMMAND_STALE` and kept the accepted file bytes.
- **PASS, actual desktop Studio on Chrome.** Both Apply results matched their MCP documents. Native and worker volumes matched the independent calculations. Initial pcurve gaps were at most `5.1e-15` mm and edge-to-surface gaps were below `2.3e-15` mm. Moving the reference gave 4278.4 and 3600 mm³. History retargeting kept both feature IDs and gave 5311.292637 and 3102.904436 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. Invalid saved cap and wall edits were refused with the current model intact. The parallel Offset, box cap, drafted wall and heptagonal wall desktop regressions passed.
- **PASS, affected checks.** 58 Kernel, 30 Model and 40 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All six desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, the 1024-point limit and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in trapezoid-upper trapezoid-wall upper drafted-wall heptagon-wall; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in trapezoid-upper trapezoid-wall upper drafted-wall heptagon-wall; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

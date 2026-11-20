# D1440 — Replace a cap of a straight circular cylinder

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `3a95701b6aff256f3c6e661a7a00c5fcc977973c`.

**Replace face** accepts either planar cap of a certified straight circular solid extrusion. It lifts each of the two exact rational half rims onto the selected plane. Uniform cylindrical charts retain the original outward surface, axis and radius. The fixed cap and native incidence IDs stay. The minimum signed thickness is computed over the actual disk by subtracting radius times the slope magnitude from the center thickness.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused the exact top cap. Preview revision `e06134a3991f0e10` kept the original `640π` mm³ body and source bytes.
- **PASS, native kernel.** The test cylinder has radius 8 mm, center (14, 12) mm and height 10 mm. The upper replacement plane `z = 8 + x/10 + y/5` gives height 11.8 mm at that center and volume `755.2π` mm³. The lower plane reflects it about `z = 5`. Independent first moments give centroid `[14 + 8/59, 12 + 16/59, 5.9 + 2/59]` mm for the upper cap. Both solid results keep four faces and loops, 12 coedges, six edges, four vertices and all 12 pcurve IDs. Samples satisfy the ellipse plane and original outward radius. A center thickness of 2 mm closes with positive rim clearance. Exact rim contact and crossing refuse even with positive integrated volume. A solid outward cylinder does not authenticate as a cylindrical bore.
- **PASS, actual stdio MCP.** Review revisions `67e58f7605ed2c0f` and `eae391a23452bdcc` gave 2372.531 mm³ in both rounded summaries. Each reference remained 192 mm³. Stale replay returned `COMMAND_STALE` with the accepted document byte-identical.
- **PASS, actual desktop Studio on Chrome.** Both Apply results matched their MCP documents. Native quadrature and worker volumes were 2372.530772011830 and 2372.530771962373 mm³, with both initial gap metrics below `7.6e-15` mm. Moving the reference gave 2774.654632 mm³. History retarget kept each feature ID and gave 3392.736140 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. Saved contact cases refused with the open model intact. The bored-cap replacements, tilted bore diameter and trapezoidal wall desktop regressions passed.
- **PASS, affected checks.** 69 Kernel, 57 Model and 37 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All six desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export and coaxial hollow tube replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in cylinder-upper cylinder-lower bored-upper bored-lower trapezoid-wall; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in cylinder-upper cylinder-lower bored-upper bored-lower trapezoid-wall; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1439_SOURCE_FROZEN=1 node test/tilted-bore-requirement-browser.mjs "$EVIDENCE/studio-diameter" \
  "$EVIDENCE/wire-bored-upper/box-and-reference.bcad" \
  "$EVIDENCE/wire-bored-upper/mcp-replaced.bcad" "$EVIDENCE/wire-bored-lower/mcp-replaced.bcad"
```

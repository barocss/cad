# D1443 — Replace a rectangular plate cap with two through bores

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `9b2729ee68ff6b92f399ae150f65925b6da20586`.

**Replace face** accepts either planar cap of a rectangular plate with two distinct straight circular through bores. It checks the pairing of each cap rim across the same two inward cylinder halves. Both holes must clear the rectangle and each other. It retains the four vertical wall supports, the original two cylinders, both sloped trim rings and their exact incidence. Offset face and bore healing retain their single-bore scope.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused the selected cap. Review revision `233f3059e88ac845` preserved the source bytes and the original volume `12000 − 130π` mm³.
- **PASS, native kernel.** The 40 × 30 × 10 mm plate has radii 3 and 2 mm at (11, 9) and (27, 20) mm. Integrating `z = 8 + x/10 + y/5` over the rectangle minus the two discs gives `15600 − 156.9π` mm³. The lower fixture reflects it about `z = 5` mm. Both strict genus-2 solids keep ten faces, fourteen loops, 48 coedges, 24 edges, sixteen vertices and all 48 pcurve IDs. Both radii and both rim curves remain exact. A corner reaching the fixed cap refuses, and the original B-rep stays intact. A plate with three bores refuses.
- **PASS, stdio MCP.** Revisions `7f91fb9d675a536d` and `24922537678433c2` both reported 15107.084 mm³ and kept the 192 mm³ reference solid. Both stale commands returned `COMMAND_STALE` and preserved the accepted file bytes.
- **PASS, actual desktop Studio on Chrome.** Both Apply results matched the MCP documents. Native and worker volumes were 15107.08411262988 and 15107.084112655055 mm³. The maximum initial pcurve gap was below `8.2e-15` mm. Move, History retarget, Undo, Redo, Save, fresh Open and exact MCP file Open passed. Opening a replacement that reached the fixed cap refused and kept the accepted model. Actual single-bore plate, eccentric tube and cylinder cap controls passed. All six desktop receipts had zero page errors, console errors and source changes.
- **PASS, affected checks.** 77 Kernel, 57 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and general multi-bore replacement. The edited native supports establish both radii in this decision. Studio Requirements and MCP diameter verification for the two tilted bores remain D1444. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in two-bore-upper two-bore-lower bored-upper eccentric-tube-upper cylinder-upper; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in two-bore-upper two-bore-lower bored-upper eccentric-tube-upper cylinder-upper; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
```

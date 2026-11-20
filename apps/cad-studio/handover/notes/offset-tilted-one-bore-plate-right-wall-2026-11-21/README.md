# D1454 — Offset the right wall of a tilted one-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `9f1a300f887bbe17f7c812369feb32b600a50d5f`.

**Offset face** accepts the X+ outer wall of the rectangular plate with one circular through bore after Replace face tilts either cap. The moved wall meets the original cap planes at four recomputed endpoints. Affected planar trim charts cover the new straight edges and exact elliptical rim. The other supports, cylinder, bore edges and topology IDs stay. Model and saved-file admission use a signed distance.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused the named right wall on both bodies. MCP revisions `7ab626bb58733166` and `ef643dba9d242654` retained the source file and the 15291.81 mm³ part.
- **PASS, native kernel.** An independent integral over the rectangle minus the bore gives `30W(11 + W/20) − 98.1π` mm³. The +5 mm move gives `17887.5 − 98.1π`. The −4 mm move gives `13824 − 98.1π`. The result keeps the 6 mm diameter, eight faces, ten loops, 36 coedges and pcurve IDs, 18 edges and 12 vertices. The original planes and four moved intersections agree. At −26 mm the wall reaches the bore and refuses. A separate witness with cap height `30 − x/2` allows +19.9 mm and refuses +20 mm when the caps touch.
- **PASS, actual desktop Studio and stdio MCP.** Both cap cases completed +5 mm with the native handle, contact refusal at −26 mm, and −4 mm in History. Apply retained the reference body and matched the MCP document. Undo, Redo, Save, fresh Open, and Open of the MCP file preserved the edited native result. The largest observed Studio witness pcurve gap was below `2.3e-14` mm. The flat one-bore right wall control passed. All three final receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 94 Kernel, 62 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile and STEP. The other tilted outer walls and tilted stock with multiple bores remain outside this decision. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Create the two tilted inputs with the [D1438 MCP fixture](../replace-bored-plate-cap-2026-11-21/README.md). Use the flat [D1451 fixture](../offset-bored-plate-right-wall-2026-11-21/README.md) as a control. Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-bore-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,brep/cylindrical-bore}.ts packages/barocss-cad-model/src/engine/doc.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
for side in upper lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$side" "bored-$side"
done
cd apps/cad-studio
for side in upper lower; do
  BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-$side" "$EVIDENCE/wire-$side/mcp-replaced.bcad" Right
done
BORED_WALL_OFFSET_FROZEN=1 node test/offset-bored-wall-browser.mjs "$EVIDENCE/studio-flat-control" "$EVIDENCE/bored-plate.bcad" Right
```

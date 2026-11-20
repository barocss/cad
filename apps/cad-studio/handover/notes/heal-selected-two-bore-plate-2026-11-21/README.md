# D1445 — Heal the selected through bore in a two-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `6b22cd7b402133aa168f0b6a934ef9b462de3437`.

**Delete face** now fills either of the two separate through bores on a flat rectangular plate. The kernel resolves the selected native wall to its exact pair. It removes those two cylinder faces and their two cap trims. The other bore, plate supports and surviving geometry retain their IDs and exact incidence. Studio makes one editable history feature and keeps both original Hole features.

## Verification

- **FAIL, baseline.** Studio selected each exact bore wall but left Delete face unavailable. Stdio MCP revision `ec326a75f2eca2e7` refused both commands and preserved the original `12000 − 130π` mm³ plate and source bytes. The first browser harness expected a toast. The second expected an ARIA-disabled option. The palette uses its unavailable row and reason instead. The corrected run proved both baseline refusals.
- **PASS, native kernel.** Each half of the same native wall pair gives the same strict result. Filling the 6 mm bore leaves 4 mm and `12000 − 40π` mm³. Filling the 4 mm bore leaves 6 mm and `12000 − 90π` mm³. Both first moments match the corresponding rectangle-minus-disc calculation. The result has genus 1, eight faces, ten loops, 36 coedges, eighteen edges and twelve vertices. Surviving trim and support objects stay, including the retained bore wall pair. A tilted cap, three bores, blind hole, countersink, missing or ambiguous selection, and malformed pcurve remain outside this operation.
- **PASS, actual desktop Studio and stdio MCP.** Both pointer selections and Apply results match the two MCP documents under revision `31f8e9a486b02790`. Native and worker volumes are 11874.336293856402 and 11717.256661176889 mm³. Edge-to-surface gaps are zero. Both original hole features stay. Undo, Redo, Save, fresh Open and exact MCP file Open pass. A file with a wrong bore signature refuses and keeps the current part. Old revision replay returns `COMMAND_STALE` and keeps the file. The original single-bore control still heals to 12000 mm³. All four final desktop receipts record zero page errors, console errors and source changes.
- **PASS, affected checks.** 78 Kernel, 63 Model and 37 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, and successive healing of both bores in one history. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face offset-bored-cap replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,part/part-model}.ts packages/barocss-cad-model/src/{app/deleteFaceCommand,engine/doc,chat/part/features}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for variant in first second single; do
  DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-$variant" "$variant"
done
```

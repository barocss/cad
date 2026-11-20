# D1448 — Heal a selected bore on the tilted two-bore plate

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `e37e763fb07d32981e1819a672f4a43b1ebb6b2e`.

**Delete face** fills either bore after **Replace face** tilts either end of the D1443 rectangular plate. The kernel binds the selected exact wall pair across both caps and authenticates the separate surviving bore. It removes the selected pair and its two trims. The original slope, surviving cylindrical support and all surviving incidence keep their exact shapes and IDs.

## Verification

- **FAIL, baseline.** Studio and stdio MCP refused each selected bore on both tilted plates. The pinned upper and lower revisions `e609d7800f3754b7` and `8d1295abb99f25b8` kept the 15107.084 mm³ rounded volume and original bytes.
- **PASS, native kernel.** Both native halves of each bore give the same result on both caps. Filling the 6 mm bore leaves verified diameter 4 mm and `15600 − 58.8π` mm³. Filling the 4 mm bore leaves verified diameter 6 mm and `15600 − 98.1π` mm³. The strict genus-1 body has eight faces, ten loops, 36 coedges, eighteen edges and twelve vertices. Both exact planes remain. The independent tilted rectangle-minus-disc centroid agrees. The Part replay matches the direct result. Two obsolete refusal assertions in the earlier test were removed when this case became supported.
- **PASS, actual desktop Studio and stdio MCP.** The four pointer Apply results match their MCP documents. Each preserves the upstream Replace face and reference body. Native and worker volumes agree with the independent integrals. The retained bore's exact 4 mm or 6 mm diameter is verified from its two wall and rim pairs. Undo, Redo, Save, fresh Open and exact MCP file Open pass. A changed stored radius refuses Open and keeps the accepted plate. Stale MCP replay keeps the accepted bytes. Actual single-bore tilted and flat two-bore controls pass. All seven final desktop receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 83 Kernel, 64 Model and 37 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, changing the donor after healing, and successive healing of the two tilted bores. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face offset-bored-cap replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{brep/cylindrical-bore,part/part-model}.ts packages/barocss-cad-model/src/engine/doc.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
for side in upper lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-two-bore-$side" "two-bore-$side"
done
cd apps/cad-studio
for side in upper lower; do
  for bore in first second; do
    DELETE_TILTED_BORE_FROZEN=1 node test/delete-tilted-bore-face-browser.mjs "$EVIDENCE/studio-$side-$bore" \
      "$EVIDENCE/wire-two-bore-$side/mcp-replaced.bcad" "$side" "$bore"
  done
done
```

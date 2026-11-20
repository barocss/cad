# D1431 — Replace either cap of a drafted rectangular extrusion

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `cf8f3784d0d81b379f439f9bb4d7ec93ec48eb74`.

**Replace face** accepts either cap of a strictly admitted drafted rectangular extrusion. Its four corner lines follow the original pairs of sloped wall planes. The new cap crosses those lines on the selected planar reference. The opposite cap and the four wall supports stay. Native IDs and named incidence are preserved. The existing recipe reads the live reference and can retarget in History.

## Verification

- **FAIL, baseline.** Actual stdio MCP and desktop Studio selected the top cap of the 40 × 30 × 10 mm drafted part and refused Replace face. The source stock stayed at 11313.333333333334 mm³.
- **PASS, native Kernel.** With all four walls drafted inward by a slope of 1:10 and the upper plane `z = 8 + x/10 + y/5`, the four stations are `[800/97, 400/33, 1800/103, 1400/101]` mm. The lower plane `z = 2 − x/10 − y/5` gives `[200/103, −200/101, −800/97, −400/99]` mm. Signed tetrahedra from independent intersections give 14397.372877113554 mm³ for the upper and 15042.506704412142 mm³ for the lower. Native centroids agreed with the independent first moments. The strict solids keep 6 faces, 12 edges, 8 vertices and all authored incidence IDs. The original drafted fixture has no pcurves. The replacement preserves that state. The kernel refuses parallel or turned-over corner lines, a corner touching the opposite cap, and opposite side supports that close or cross.
- **PASS, actual stdio MCP.** Review pins `cf53c20cd60c0db2` and `aae4098847b2b448` produce 14397.373 and 15042.507 mm³ in the rounded summary. Each reference stays 192 mm³. Reusing either review pin returns `COMMAND_STALE` and preserves the accepted file bytes.
- **PASS, actual desktop Studio.** Applying either cap produced the same authored model as MCP and matched all three coordinates of each native corner. Moving the upper donor +2 mm in Z updated the stock to 16422.961750 mm³. Moving the lower donor −2 mm updated it to 17558.164002 mm³. Selecting the other donor face in History kept the feature IDs and yielded 19436.678250 and 21537.474632 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. Both one-corner contact files left the open document in place. The worst native edge-to-surface gap was below `7.11e-15` mm. The box cap and wall replacements and parallel Offset passed in separate Studio flows.
- **FAIL, intermediate.** The first lower contact fixture shifted the reference by +8 mm. That remained valid because the fixed corner is at (1, 1, 10), where the lower plane reaches Z = 10 mm only after +8.3 mm. The corrected fixture refused in desktop Studio.
- **PASS, affected checks.** 43 Kernel, 30 Model and 40 Studio tests, Kernel and Studio builds, Model type-check, scoped lint and the generated agent tool table. All seven final desktop receipts record zero page errors, console errors and watched source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, replacement of a drafted wall, and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in drafted-upper drafted-lower upper lower diagonal height; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in drafted-upper drafted-lower upper lower diagonal height; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

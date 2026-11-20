# D1432 — Replace a drafted rectangular side wall

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `814d5996f364a97b0c323d61b7dd7829c59405dd`.

**Replace face** accepts an exact side wall of a strictly admitted drafted rectangular extrusion. The new wall meets the two original cap planes and the adjacent wall planes. The five other supports and native incidence IDs stay. The saved recipe reads the live reference. The feature signature checks the exact native plane of the original drafted wall.

## Verification

- **FAIL, baseline.** Actual stdio MCP and desktop Studio selected `n1.side1` on the 40 × 30 × 10 mm drafted extrusion and refused Replace face. The original volume was 11313.333333333334 mm³.
- **PASS, native Kernel.** With four inward wall slopes of 1:10, the X-max plane `x = 37 + y/10 + z/2` meets the fixed supports at X coordinates [37, 40, 42.1, 44.9] mm. Integrating the horizontal area `(30 − 0.2z)(38.5 + 0.4z)` gives `35215/3` mm³. Independent first moments give centroid `[29251159/1408600, 1068659/70430, 35390/7043]` mm. A rotated Y-min witness matches the transformed centroid and volume. The strict solids retain six faces, twelve edges, eight vertices, all incidence IDs, and the absence of pcurves in this drafted source. A steep valid donor keeps the selected outward direction when its normal is reversed. The kernel refuses the opposite wall touching or crossing one corner, a parallel or nearly parallel donor, a perpendicular donor, and a changed source face signature.
- **PASS, actual stdio MCP.** Review pin `2ee0c4a5b5f7f036` produces 11738.333 mm³ in the rounded summary and keeps the 192 mm³ reference. Reusing the pin gives `COMMAND_STALE` and leaves the accepted file byte-identical.
- **PASS, actual desktop Studio.** Apply produced the same document as MCP. Native and worker dimensions matched all four independent corners and the volume. Driving the reference +2 mm in X produced 12318.333333 mm³. Retargeting to the other donor face kept the feature ID and produced 11341.760755 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. A one-corner contact file was refused and the current document stayed. The largest native edge-to-surface gap was below `4.0e-15` mm. The box and drafted cap replacements and the parallel Offset flow passed separately.
- **PASS, affected checks.** 45 Kernel, 30 Model and 40 Studio tests, Kernel and Studio builds, scoped lint, Model type-check and generated agent tool table. All eight desktop receipts recorded zero page errors, console errors and watched source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, nonrectangular source replacement and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in drafted-wall drafted-upper drafted-lower upper lower diagonal height; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in drafted-wall drafted-upper drafted-lower upper lower diagonal height; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

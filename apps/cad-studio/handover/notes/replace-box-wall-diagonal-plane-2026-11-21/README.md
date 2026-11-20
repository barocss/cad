# D1428 — Replace a box wall with a plane tilted in two directions

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `4fae94f81a0e348247cfeab8b39b7eb996c1603f`.

**Replace face** extends the four corners of one cardinal wall of a straight rectangular extrusion onto a selected planar face. The reference can tilt across the wall width, height, or both. The other five supports stay. The original face, edge, vertex, loop, coedge and pcurve identities stay. The live reference and the parallel Offset face workflow retain their existing document and command contracts.

## Verification

- **FAIL, baseline.** Actual stdio MCP and desktop Studio selected `n1.side1` and `n3.bottom`. Both refused the two-direction tilt and kept the 12000 mm³ source box. Studio disabled Apply.
- **PASS, native Kernel.** For a 40 × 30 × 10 mm box, the plane `x = 37 + y/10 + z/2` gives X coordinates 37, 40, 42 and 45 mm at the four corners. Integrating over the original Y/Z rectangle gives 12300 mm³ and the centroid `[10103/492, 1245/82, 1255/246]` mm. The strict B-rep keeps 6 faces, 12 edges, 8 vertices and all 24 pcurve IDs. Width-only tilt gives 11700 mm³ in a separate case. A shift of −37 mm makes one corner touch the opposite wall and a shift of −38 mm makes one cross it. The kernel refuses both and preserves the input, although their signed volume integrals are 1200 and 900 mm³. Tests also cover height-only tilt, perpendicular and nearly parallel planes, and coordinate range.
- **PASS, actual stdio MCP.** A four-view review at revision `f8c824b7cf7e9fa1` pins the same faces. The typed command returns 12300 mm³ for the box and 192 mm³ for the reference. The old pin then returns `COMMAND_STALE` and preserves the accepted file byte for byte.
- **PASS, actual desktop Studio.** Apply produces the same authored document as the MCP command. The Studio worker and native read give 12300.000000000004 mm³, with maximum edge-to-surface gap below `3.56e-15` mm. Moving the donor +2 mm in X updates the box to 12900 mm³. Retargeting History to `n3.top` keeps the feature ID and yields `12900 − 90√126` mm³, about 11889.752506 mm³. Undo, Redo, Save, fresh Open, exact MCP file Open and refusal of the one-corner collapse preserve the expected geometry and document. The height-only Replace face and parallel Offset flows pass separately. All three browser receipts have zero page errors, console errors and watched worktree changes.
- **PASS, affected checks.** 39 Kernel, 28 Model and 40 Studio tests. Kernel build, scoped lint, Model type-check, Studio production build and generated agent tool table check passed. The agent discovery plus system prompt stayed at 24999 of 25000 characters.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, tapered or curved source faces, and other body families. #17 remains open.

Use Node 22.19.0, local Chrome and the installed Playwright. Run heavy commands under the shared gate and freeze the worktree during desktop flows. Keep evidence outside the repository.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/cad-studio/test/replace-face-mcp.mjs "$WIRE_OUT" diagonal
node apps/cad-studio/test/replace-face-mcp.mjs "$HEIGHT_WIRE_OUT"
cd apps/cad-studio
REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$STUDIO_OUT" "$WIRE_OUT/box-and-reference.bcad" "$WIRE_OUT/mcp-replaced.bcad" diagonal
REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$HEIGHT_OUT" "$HEIGHT_WIRE_OUT/box-and-reference.bcad" "$HEIGHT_WIRE_OUT/mcp-replaced.bcad"
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$OFFSET_OUT" axis
```

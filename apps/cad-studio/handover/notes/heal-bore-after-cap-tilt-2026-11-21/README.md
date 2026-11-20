# D1447 — Heal one bore while keeping its tilted cap

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `558f050e557c0218ce3376baea68213c751b964d`.

**Delete face** fills the one straight through bore of the D1438 rectangular plate after either cap is tilted. The kernel verifies both bore rims, the same inward wall pair, four straight wall supports and positive clearance at every rectangle corner. It keeps both cap support charts, including the tilted plane, and removes only the selected cylinder pair and its two cap trims. Studio keeps the upstream Replace face recipe and its reference body.

## Verification

- **FAIL, baseline.** Desktop Studio and stdio MCP refused Delete face after either cap tilt. MCP revisions `7ab626bb58733166` and `ef643dba9d242654` preserved the source bytes and the 15291.810 mm³ rounded volume.
- **PASS, native kernel.** Both signs and both named halves of the same bore pass. The independent affine-height integral increases from `15600 − 98.1π` mm³ to 15600 mm³. The two volume centroids are `(820/39, 210/13, 20/3)` and `(820/39, 210/13, 10/3)` mm. Strict genus 0 has six faces, six loops, 24 coedges, twelve edges and eight vertices. The surviving supports and trims keep their exact objects and identities. The Part recipe reproduces the direct result. The first overlay test used an absolute source quadrature tolerance of `1e-8` mm³ and missed the lower source by `2.92e-8` mm³. The canonical source tolerance is `1e-7` mm³. Both final volume and centroid checks keep their original tolerances.
- **PASS, actual desktop Studio and stdio MCP.** The two Studio pointer Apply results match the revision-pinned MCP documents. Their worker and native volumes match 15600 mm³. The donor solid and the target reference recipe stay intact. Undo, Redo, Save, fresh Open and exact MCP file Open pass. Changing the healed wall's stored radius rejects Open and keeps the accepted plate. Stale MCP replay keeps the accepted bytes. Flat single-bore and successive-heal controls pass. All five final desktop receipts have zero page errors, console errors and source changes.
- **PASS, affected checks.** 81 Kernel, 64 Model and 37 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, change to the reference plane after healing, and multi-bore plates with a tilted cap. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face offset-bored-cap replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,brep/cylindrical-bore,part/part-model}.ts packages/barocss-cad-model/src/engine/doc.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
for side in upper lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-bored-$side" "bored-$side"
done
cd apps/cad-studio
for side in upper lower; do
  DELETE_TILTED_BORE_FROZEN=1 node test/delete-tilted-bore-face-browser.mjs "$EVIDENCE/studio-$side" \
    "$EVIDENCE/wire-bored-$side/mcp-replaced.bcad" "$side"
done
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-flat-control" single
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-successive-control" first successive
```

# D1446 — Heal both bores in two separate edits

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `1e3f80b73754167634cf1f5f3ee13f45466d2884`.

After one selective **Delete face** on a flat two-bore plate, the remaining bore can be selected for a second Delete face. Model accepts that exact preceding recipe as a source. It keeps both individual face signatures and the existing kernel checks. The two heals stay separate history entries. Both original Hole features remain in the document.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused to heal the surviving bore after either first heal. MCP revisions `8eeabe52b316632b` and `7cd5cfd4774d534a` kept the one-bore volumes 11874.336 and 11717.257 mm³ and the accepted bytes.
- **PASS, native kernel.** Both operation orders restore the same exact outer B-rep. The final volume is 12000 mm³, with centroid (20, 15, 5) mm, genus 0, six faces, six loops, 24 coedges, twelve edges and eight vertices. The external face and surface IDs stay. The raw Part recipe produces the same result as the direct native operation. The first regression harness incorrectly expected object identity across independent Part evaluations. The corrected test checks identity within one operation and value equality across evaluations.
- **PASS, actual desktop Studio and stdio MCP.** Both pointer sequences match the revision-pinned MCP documents at each step. Each Undo restores its preceding document. Each Redo reapplies one heal. The complete model saves and opens in a fresh Studio context and matches the exact MCP file. A changed signature on the second recipe refuses Open and keeps the accepted model. Single-heal controls on one and two bores pass. The final receipts have zero page errors, console errors or source changes.
- **PASS, affected checks.** 28 Kernel, 33 Model and 32 Studio tests. Affected lint, Model type-check, Studio production build and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and healing after tilted cap replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
node --test packages/barocss-cad/test/{bored-face-delete,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face offset-bored-cap replace-face revision-pinned-command toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/{src/engine/doc.ts,test/delete-bore-face.test.ts}
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for order in first second; do
  DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-$order-successive" "$order" successive
done
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-first-control" first
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-single-control" single
```

# D1449 — Heal both bores in sequence after a cap tilt

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `7d83d8a4eca90a9ccb5c7a6cc3453307b0d768de`.

After the first **Delete face** on a D1448 tilted two-bore plate, Model admits the surviving bore as the source of a separate second heal. The kernel uses its existing single-bore tilted proof. Both Hole features, the Replace face recipe, its reference body and the two heal entries remain in the document.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused the surviving bore after the first heal on both caps and in both orders. Revisions `407d41112508b5a9`, `3c7fd4acef23251b`, `46db6ed8ff5109ea` and `160436128713aa53` kept each accepted one-bore model and source bytes.
- **PASS, native kernel.** For each cap, both operation orders produce the same six-face solid. The independent volume is 15600 mm³. Centroids are `(820/39, 210/13, 20/3)` and `(820/39, 210/13, 10/3)` mm. The strict genus-0 result keeps both cap planes, the exact original exterior IDs and all surviving trims. The Part replay matches the direct heal result.
- **PASS, actual desktop Studio and stdio MCP.** All four two-edit sequences match the revision-pinned MCP documents at each step. The first step verifies the surviving diameter and its own independent volume. Each Undo and Redo changes one heal. Save, fresh Open and exact MCP file Open preserve the final 15600 mm³ solid and the original reference. An altered second signature refuses Open and keeps the accepted plate. Stale MCP replay preserves each accepted step. The one-step tilted two-bore, tilted single-bore and flat successive controls pass. All eight desktop receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 32 Kernel, 33 Model and 32 Studio tests. Affected lint, Model type-check, Studio production build and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and changes to the upstream donor after the two heals. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
node --test packages/barocss-cad/test/{bored-face-delete,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face offset-bored-cap replace-face revision-pinned-command toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/engine/doc.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
for side in upper lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-two-bore-$side" "two-bore-$side"
done
cd apps/cad-studio
for side in upper lower; do
  for order in first second; do
    DELETE_TILTED_BORE_FROZEN=1 node test/delete-tilted-bore-face-browser.mjs "$EVIDENCE/studio-$side-$order" \
      "$EVIDENCE/wire-two-bore-$side/mcp-replaced.bcad" "$side" "$order" successive
  done
done
```

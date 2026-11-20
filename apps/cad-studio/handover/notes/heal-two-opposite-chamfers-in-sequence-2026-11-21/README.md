# D1463 — Heal both opposite box chamfers in separate edits

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `9125361c42d9e7a4f5fec6382d99263bd056fa55`.

After [D1462](../heal-one-of-two-opposite-chamfers-2026-11-21/README.md), select the surviving numbered bevel and apply a second **Delete face**. The second edit must follow the original two-edge Chamfer through the first exact Delete face. It proves that the first operation restored one original sharp edge. It then uses the existing single-bevel geometry check to restore the other edge. Keep both feature steps and the original six stock face names and IDs.

## Verification

- **FAIL, baseline.** Actual desktop Studio showed the surviving exact face name `n2.face#1` or `n2.face#2` but disabled the second Delete face. Stdio MCP refused both at revisions `e1d8f48bd305008e` and `4d7342a603b8296a`. Source file bytes and 11980 mm³ stayed.
- **PASS, native kernel.** Both opposing diagonals, both source edge orders and either heal order pass. The 40 × 30 × 10 mm stock loses two independent `(2 × 2 ÷ 2) × 10 = 20` mm³ cuts. Volumes progress 11960 → 11980 → 12000 mm³. Final centroid is `[20, 15, 5]` mm. The six original plane supports and face identities stay, and both sharp edge names return. The strict solid has six faces, six loops, 24 coedges, 12 edges and eight vertices. The missing and unrelated faces refuse. An additional native probe at nominal and translated origins gave 16 passes and checked rejection after an intervening Translate.
- **PASS, actual desktop Studio and stdio MCP.** Apply both edits without opening another document between them. Undo each edit to its exact earlier solid and Redo each edit. Both orders Save and fresh Open to the 12000 mm³ native box. The two-step MCP and Studio recipes match. An already removed face, an unrelated plane and a stale revision refuse without changing the MCP file. Both final receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 146 Kernel, 135 Model and 44 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table. The Model comparison uses the decoded first-edit prefix because JSON encodes signed zero as zero.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and neighboring chamfers. #17 stays open.

Use Node 22.19.0, the two-bevel input from D1462, and existing Chrome and Playwright. Run heavy commands under the shared gate. Keep evidence outside Git and freeze worktree writes during Studio runs.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command selectors observe views rematch references toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs body-selection-query-ui document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/part/part-model.ts packages/barocss-cad-model/src/engine/doc.ts packages/barocss-cad-model/test/delete-chamfer-face.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for end in sw ne; do
  DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-$end" "$EVIDENCE/two-chamfers.bcad" "double-$end" sequence
done
```

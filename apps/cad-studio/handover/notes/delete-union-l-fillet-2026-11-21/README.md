# D1426 — Heal the inside fillet of a two-box L bracket

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `ef717640583dd2f78ff57946a0b436a0de2e59e0`.

Delete face now heals the one full-span concave circular fillet along Y on a cardinal L bracket made by uniting two boxes. The command stores the exact current fillet face and appends a feature. The original Union and Fillet stay in History.

The kernel proves the current analytic-Boolean chart, sole constant fillet, two end rims and two tangent walls. It extends the two planar walls and four adjacent end edges to the sharp corner and verifies that the two end sections and six full-span walls form the same straight L. It checks the rebuilt solid strictly. All surviving face, edge, vertex, loop and coedge identities stay. The restored ridge, its two end vertices and its two coedges get fresh IDs.

## Verification

- **PASS, native Kernel.** The sharp union of the 40 × 20 × 3 mm foot and 3 × 20 × 30 mm upright gives exactly 4020 mm³ and an independent centroid. The analytic heal agrees to `1e-9` relative volume and `1e-9` mm in each centroid coordinate. The result has 8 faces, 8 loops, 40 coedges, 20 edges, and 14 vertices. All 8 surviving face IDs and 19 surviving edge IDs and names match. The restored ridge is from (3, 0, 3) to (3, 20, 3) mm. The original input equals its frozen pre-edit snapshot. Chamfer, convex round, stale signature, wrong face and foreign pcurve are refused.
- **PASS, local stdio MCP.** The actual command applied to `n5.face` with review revision `90cbed2f9e696919`, appended the heal and returned a volume of 4020 mm³. Replaying the old revision returned `COMMAND_STALE` and kept the accepted file byte for byte.
- **PASS, desktop Studio.** Open the exact original MCP file, select `n5.face`, and apply Delete face. Undo, Redo, Save and fresh Open passed. The native reader and Studio worker both measured 4020 mm³ before and after Open. The surviving face and edge IDs matched, and the maximum edge-to-surface gap was 0 mm. Studio also opened the exact MCP-authored healed file and refused a file with a stale fillet signature while keeping the current document. The single-extrusion L-section regression passed. Both final flows recorded zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 41 Kernel, 29 Model and 25 Studio tests, scoped lint, generated agent tool table, Kernel build, Model type-check and Studio production build.
- **FAIL, base.** Actual MCP and Studio refused healing the selected `n5.face` at the base. With the Model route exposed but before the analytic kernel route, the new focused regression was refused by the kernel.
- **NOT_RUN.** Full local suites, WebGL2, mobile, broader fillet topology and general analytic face replacement. The remaining #17 criteria stay open.

Use Node 22.19.0 and local Chrome and Playwright. Run heavy tasks in order under the shared gate and freeze source during desktop tests. Keep screenshots and wire receipts outside the repository.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{analytic-l-fillet-heal,prismatic-fillet-heal,bored-face-delete,bored-cap-offset,drafted-cap-offset,prism-wall-offset}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face mould-walls offset-bored-cap offset-to-plane revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs document-file command-apply toolset-mcp tool-contract-mcp
node apps/cad-studio/test/union-fillet-heal-mcp.mjs "$WIRE_OUT"
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$OUT" "$WIRE_OUT/union-bracket-r2.bcad" "$WIRE_OUT/agent-healed.bcad"
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$UPRIGHT_OUT"
```

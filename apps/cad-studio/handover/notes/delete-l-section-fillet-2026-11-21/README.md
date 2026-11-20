# D1425 — Heal the inside fillet of a straight L-section

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `663287c3a759c1d5f20569788c6f8aed27a702fa`.

An L-section made from one axis-aligned extrusion now supports **Delete face** on its one full-height concave circular fillet. The operation reads the current one-slab section, checks its cylindrical boundary, extends the two tangent walls to their sharp intersection, and rebuilds the orthogonal section. The original Fillet stays in History. The six walls, two caps and surviving edges keep their persistent names. The restored sharp edge uses its original name, and the new B-rep uses fresh numeric IDs. The existing exact-face signature and review pin protect the command's target.

## Verification

- **PASS, native Kernel.** An independent two-box union yields 4020 mm³. Two orientations of the R2 L-prism heal to that volume within `1e-9` relative, with all three transformed centroid coordinates within `1e-9` mm and retained face and edge names. Strict topology after healing is 8 faces, 8 loops, 36 coedges, 18 edges and 12 vertices. Chamfer, convex and multiple rounds, and the general non-upright Fillet are refused.
- **PASS, desktop Studio.** Select the actual fillet face, preview and Apply. The rounded solid measured 4037.1681469282057 mm³ against `4020 + 20 × (4 - π)` mm³. Undo, Redo, Save and fresh Open passed. The healed solid measured exactly 4020 mm³ in the native reader and Studio worker, with a maximum edge-to-surface gap of 0 mm. The existing single-bore Delete face flow also passed.
- **PASS, affected checks.** 38 Kernel, 28 Model and 25 Studio tests, scoped lint, generated agent tool table, Kernel build, Model type-check and Studio production build.
- **FAIL, base and intermediate.** Local stdio MCP refused Delete face on the valid R2 fixture at the base. The first fixture driver searched for a display name containing "fillet"; the actual native name is `n2.face`. One intermediate Studio regression recorded a source write from a parallel agent. After stopping edits, both final desktop flows ran again on the same source with zero write events, page errors and console errors.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, analytic face replacement and general trimmed fillet editing. The remaining #17 criteria stay open.

Use Node 22.19.0 and local Chrome and Playwright. Run one heavy command at a time under the shared gate. Freeze the worktree during desktop tests and keep receipts outside it.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-fillet-heal,bored-face-delete,bored-cap-offset,drafted-cap-offset,prism-wall-offset}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face mould-walls offset-bored-cap offset-to-plane revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs document-file command-apply toolset-mcp tool-contract-mcp
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$FILLET_OUT"
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$BORE_OUT"
```

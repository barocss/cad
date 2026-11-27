# D2097 — Offset an original convex polygon extrusion wall

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#17](https://github.com/barocss/cad/issues/17) · Base `12f2abf08a552b807f3f6b5933555cd1e2ab5d2e`.

Signed Distance Offset moves one original side of an upright, uncut, zero-draft convex polygon extrusion. The kernel proves authored polygon ownership before it opts into the larger side-count range. It intersects the shifted native support with the original adjacent planes. The caps stay at their original heights, and the unchanged supports keep their equations. The existing Offset history node stores the original face and signed distance.

## Verification

- **PASS, baseline reproduction.** Actual desktop Chrome WebGPU selects the front native wall of the triangle and octagon. The old Studio refuses +2 mm for both profiles and disables Apply. Their source documents stay intact.
- **PASS, actual desktop candidate.** For both profiles, view the +2 mm preview, cancel it, reopen the command and apply it. History refuses the first edge collapse, keeps the previous result and then applies −2 mm. Undo and Redo restore each signed result. Save and fresh Open retain the original face and −2 mm. Both runs freeze 1,268 files and report zero source changes, page errors or console errors.
- **PASS, independent native result.** The triangle uses `V = 7.5(16 + d)²` and keeps 5 faces, 5 loops, 9 edges, 6 vertices and 18 coedges. With `d = +2` and `−2` mm, the volumes are 2,430 and 1,470 mm³. At −16 mm, the triangle collapses and the command refuses. The octagon uses `V = 2880 + 120d − 10d²` and keeps 10 faces, 10 loops, 24 edges, 16 vertices and 48 coedges. The volumes are 3,080 and 2,600 mm³. At −4 and +6 mm, a wall loses an edge and the command refuses. Studio and the strict native result agree within 0.00000001 mm³. Independent corners, support equations and native trim ownership agree at both signed offsets and on reopen.
- **PASS, affected checks.** The 124 Kernel tests include an oblique triangular wall, owned native Move chains, a parameter rebuild, collapse refusal and the previous hex output byte controls. The 118 Model tests include a revision-pinned local Agent command that applies the triangular Offset and refuses stale or collapsing input. The 10 Studio tests, emit, all three type checks, scoped ESLint, driver syntax, diff checks and the Studio build pass on Node 22.19.0.
- **FAIL, corrected verification setup.** The first type command did not find the cached compiler through macOS's temporary-directory symlink. The repeat uses the verified compiler path. The first lint call flagged an unused destructured point in the native test. Its corrected assertion and focused native test pass.
- **NOT_RUN.** Linked To plane for the new profiles, rotated or derived stock, desktop Agent proposal approval for this exact feature, full local suites, mobile and live providers. The wider #17 acceptance remains open. The first mechanical CAD baseline remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected build under the heavy gate.
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{polygon-wall-offset,prism-wall-offset,drafted-cap-offset,bored-cap-offset,circular-wall-offset,polygon-pivot-face,hex-pivot-face}.test.mjs
pnpm --dir packages/barocss-cad-model test native-offset-face offset-face references toolset tool-contract
pnpm --dir apps/cad-studio test offset-hex-side-feedback toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

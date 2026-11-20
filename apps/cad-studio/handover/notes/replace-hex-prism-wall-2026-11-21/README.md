# D1434 — Tilt a convex hexagonal prism side wall

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `e27b87fcc6c74602cfd3273d326e5b0a2743c057`.

**Replace face** accepts a side wall of the strictly admitted straight convex hexagonal prism when the reference plane retains its horizontal direction and tilts with height. The new wall meets both caps and the two adjacent side walls. Each of the seven fixed support planes and all native incidence IDs stay. Affine corner intersections stay within the same convex wall limits between the two verified end sections.

## Verification

- **FAIL, baseline.** Actual desktop Studio and stdio MCP refused the exact oblique `n1.side1` of the six-point extrusion. MCP review revision `7541ce298c37d28d` left the original bytes and the 3840 mm³ body unchanged.
- **PASS, native kernel.** The wall `4x − 3y = 72` was replaced by `4x − 3y = 72 + 4z/5`. The lower intersections stayed at `(18,0,0)` and `(24,8,0)` mm. The upper intersections became `(20,0,10)` and `(25,20/3,10)` mm. Independent section area `384 + 8z/5 − z²/75` gives `35240/9` mm³. The strict result retains 8 faces, 8 loops, 36 coedges, 18 edges, 12 vertices and all 36 pcurve IDs. A second axis-aligned Y-min wall gave 3927.5 mm³ with both cap stations fixed. The kernel refused touch or crossing at either end despite positive integrated volume. It refused almost parallel, parallel, perpendicular and sideways-rotated donors with explicit reasons.
- **PASS, actual stdio MCP.** Review revision `b60eaebc46f872dc` gave 3915.556 mm³ in the rounded summary and kept the 192 mm³ reference. Replaying the revision returned `COMMAND_STALE` and kept the file byte-identical.
- **PASS, actual desktop Studio on Chrome.** The oblique replacement produced the same authored document as MCP. The native and worker volumes were 3915.5555555555566 mm³, and the initial native pcurve and edge-to-surface gaps were below `1.4e-14` mm. Moving the reference +2 mm in X gave 4048.8888888888896 mm³. Retargeting to the other donor face kept the feature ID and gave 3772.952088667791 mm³. Undo, Redo, Save, fresh Open and exact MCP file Open passed. Opening a file whose wall collapsed at one cap was refused and the current document stayed. The hexagonal cap, drafted wall and parallel Offset desktop regressions passed.
- **PASS, affected checks.** 51 Kernel, 30 Model and 40 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All four desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, sideways rotation of the hexagonal wall and curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields errors
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in hex-wall hex-upper drafted-wall; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in hex-wall hex-upper drafted-wall; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

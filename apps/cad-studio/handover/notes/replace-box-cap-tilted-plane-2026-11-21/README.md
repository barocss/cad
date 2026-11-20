# D1430 — Replace either box cap with a tilted plane

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `c045018225421a3c668c37d7513c0336376824ff`.

**Replace face** accepts the upper and lower caps of a straight rectangular box. Select the cap and a tilted planar face on another solid. The four wall supports and the opposite cap stay in place. The result keeps its native face, edge, vertex, loop, coedge and pcurve IDs. The existing `replace-face` recipe reads the live reference and supports retargeting in History.

## Verification

- **FAIL, baseline.** Actual stdio MCP refused `n1.top` with `n3.bottom`. Desktop Studio disabled Replace face after picking the exact top face. The source box kept its 12000 mm³ volume.
- **PASS, native Kernel.** In the 40 × 30 × 10 mm source, the upper plane `z = 8 + x/10 + y/5` gives corner Z coordinates [8, 12, 14, 18] mm. Reflecting the plane about Z = 5 mm gives [2, −2, −4, −8] mm for the lower cap. Both integrals give 15600 mm³. The first moments give centroid X and Y of 820/39 and 210/13 mm, and centroid Z of 20/3 and 10/3 mm respectively. Each strict solid keeps six faces, twelve edges, eight vertices and all 24 pcurve IDs. Reversing the reference normal gives the same solid. A perpendicular, nearly parallel or one-corner collapse is refused without changing the source. The shifted upper planes that just touch or cross the fixed cap have signed integrals of 6000 and 4800 mm³, which still must be refused.
- **PASS, actual stdio MCP.** The upper review pin `d63c8002bd63863f` and lower pin `8602ce3ecb916d82` accept 15600 mm³ boxes and keep the 192 mm³ donors. Reusing either pin returns `COMMAND_STALE` and preserves accepted file bytes.
- **PASS, actual desktop Studio.** Applying either cap produced the same authored document as MCP. The native and worker values matched the independent corners, volume and centroid. Moving the donor 2 mm outward along Z updated the box to 18000 mm³. Retargeting to the parallel face across the 3 mm donor kept the feature ID and yielded `18000 + 360√105` mm³ (about 21688.902276 mm³). Undo, Redo, Save, fresh Open and exact MCP file Open passed. Both one-corner collapse files were refused and left the accepted document in place. The worst measured native edge-to-surface gap across the accepted cap states was below `2.67e-15` mm.
- **PASS, affected checks.** 41 Kernel, 30 Model and 40 Studio tests, Kernel and Studio builds, scoped lint, Model type-check, and generated agent tool table. The separate height-only and two-direction wall replacements and the parallel Offset flow passed in desktop Studio. All five desktop receipts report zero page errors, console errors and watched source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export, drafted source faces and general curved replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Store receipts outside the repository and freeze the worktree during desktop verification.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback offset-face-launch-view toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in upper lower diagonal height; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in upper lower diagonal height; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$EVIDENCE/studio-offset" axis
```

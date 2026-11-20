# D1441 — Replace a cap of a straight coaxial circular tube

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `4149422f174c7ccf3ddd729b9afdafd9b2dd1a5e`.

**Replace face** accepts either planar cap of the strict straight circular tube with one coaxial through bore. The four exact half rims lift onto the selected plane. Both cylindrical supports keep their original radii, common axis and inward or outward sense. The retained bore diameter is verified from the projected inner and outer rings and their actual cylindrical walls. Minimum signed thickness is checked over the original outer radius.

## Verification

- **FAIL, baseline.** Actual Studio and stdio MCP refused the native cap of the coaxial tube. Revision `12c86f5cedeb5ecb` kept the `1280π` mm³ body and the original file bytes.
- **PASS, native kernel.** The tube has outer radius 12 mm, bore radius 4 mm, center (14, 12) mm and height 10 mm. The upper plane `z = 8 + x/10 + y/5` gives center thickness 11.8 mm. The lower plane reflects it about `z = 5`. Integrating over the annulus gives `1510.4π` mm³. Both results keep six faces, eight loops, 24 coedges, 12 edges, eight vertices, genus 1 and all 24 pcurve IDs. Both cap rings sample onto the selected plane and their respective cylinders. The bore reads diameter 8 mm in either member order. A single half, the outward cylinder, a mixed selection and eccentric source stock refuse. Outer rim contact refuses before the integrated volume vanishes.
- **PASS, actual stdio MCP.** Revisions `4bc4521d9db52ab6` and `ed1d22a71facdd43` gave 4745.062 mm³ in both rounded summaries and kept the 192 mm³ reference. Stale replay returned `COMMAND_STALE` and kept the accepted bytes.
- **PASS, actual desktop Studio on Chrome.** Both Apply results matched the MCP documents. Native and worker volumes were 4745.061544075143 and 4745.061544071008 mm³, within a relative `1e-9` of the independent volume. Initial edge-to-surface and pcurve gaps were below `1.6e-14` mm. Reference move, History retarget, Undo, Redo, Save, fresh Open and exact MCP file Open passed. A saved replacement reaching the opposite cap on the outer rim was refused with the current document intact.
- **PASS, Studio Requirements and stdio MCP.** The flat, upper-tilted and lower-tilted tubes pass radius 4 mm and bore diameter 8 mm. A deliberate 10 mm requirement fails with measured 8 mm. The separate reference body gives unknown. The existing rectangular plate still reads diameter 6 mm before and after tilting either cap.
- **PASS, affected checks.** 72 Kernel, 57 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and the generated agent tool table. All six desktop receipts recorded zero page errors, console errors and source changes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP export and eccentric tube replacement. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run heavy commands under the shared gate. Freeze the worktree during desktop verification and store evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs replace-face offset-to-plane revision-pinned-command revision-pinned-delete toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
for variant in tube-upper tube-lower bored-upper bored-lower cylinder-upper; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-$variant" "$variant"
done
cd apps/cad-studio
for variant in tube-upper tube-lower bored-upper cylinder-upper; do
  REPLACE_FACE_FROZEN=1 node test/replace-face-browser.mjs "$EVIDENCE/studio-$variant" \
    "$EVIDENCE/wire-$variant/box-and-reference.bcad" "$EVIDENCE/wire-$variant/mcp-replaced.bcad" "$variant"
done
D1439_SOURCE_FROZEN=1 node test/tilted-bore-requirement-browser.mjs "$EVIDENCE/studio-tube-diameter" \
  "$EVIDENCE/wire-tube-upper/box-and-reference.bcad" \
  "$EVIDENCE/wire-tube-upper/mcp-replaced.bcad" "$EVIDENCE/wire-tube-lower/mcp-replaced.bcad" 4
D1439_SOURCE_FROZEN=1 node test/tilted-bore-requirement-browser.mjs "$EVIDENCE/studio-plate-diameter" \
  "$EVIDENCE/wire-bored-upper/box-and-reference.bcad" \
  "$EVIDENCE/wire-bored-upper/mcp-replaced.bcad" "$EVIDENCE/wire-bored-lower/mcp-replaced.bcad"
```

# D1779 — Resize adjacent right and oblique saved Sketch Chamfers

P1 Sketch workflow, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `83807580a805b1afc5a5053479eef38def78c434`.

Qualify a common setback change on the two adjacent Chamfers from the D1778 profile. Use the same physical carriers and bevel tags with the implicit sketch anchor at the unaffected corner (50, 15) mm. The fixture has one remaining sketch degree of freedom. The selected setback edit preserves the anchor, carrier geometry and authored angle rules.

- **PASS, actual desktop Studio WebGPU.** Open both saved D6 bevels together. D16 is refused before applying because both bevels would cross their shared side. Enter D8 and preview, then cancel. Drag the shared setback handle to D8 and verify the same outline preview. Apply once and finish the Sketch. Undo, Redo, Save and fresh Open reproduce the edit.
- **PASS, local Agent.** Read e6 and e7 with each saved setback at 6 mm. A D16 proposal is refused. A D8 dry run preserves the source file bytes. Studio preview and explicit Accept reproduce the native body from the drag and fresh Open.
- **PASS, independent geometry.** The shared side retains 14 mm. Both bevel planes keep their original normals and use 8 mm setbacks from their own intersections. The right and oblique bevel lengths are about 11.313708499 and 15.178932769 mm. The 135°, 161.565051177° and separated 36.869897646° rules match the source. The native 10 mm extrusion measures 20,488 mm³, a decrease of 224 mm³.
- **PASS, affected checks.** 72 Model tests, scoped ESLint, driver syntax and Git diff check. The final desktop run has nine checkpoints with zero source, page or console errors. Three native records from the first run match the final run byte for byte. The reopened and Agent-approved bodies match the manual resize.
- **FAIL, recovered driver.** The first Agent discovery request omitted `includeSketchCorners`, which is required to list the saved bevels. The first run reached the correct native D8 Save and fresh Open. The corrected driver completes discovery and approval.
- **NOT_RUN.** Full local suites and production build for this driver-only delivery, a setback edit that moves the implicit anchor, pinned group image review, alternate GPU backends, mobile and live providers. Issue #21 remains open. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

Native B-rep SHA-256 for D8 is `82d6d8538085e3a22ed5de24387a49b95dc050212b6a150b150047c1eed81c58`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories.

```sh
D1779_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs "$OUT/final"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-chamfer-edit sketch-chamfer-retention toolset tool-contract
pnpm exec eslint apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs
node --check apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs
git diff --check
```

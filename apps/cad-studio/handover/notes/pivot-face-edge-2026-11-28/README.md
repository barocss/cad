# D2084 — Pivot a stock face about its original straight edge

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `fe4a42f3bc3cd5917d2a8e6d028fe7c4beaf3c89`.

Select a planar face of one original rectangular extrusion and Shift-select one straight edge on it. **Modify > Pivot face** shows both original names and a signed angle. A positive angle tilts inward. History edits the angle and retains the fixed edge. Local MCP exposes the same command with one exact face name, one exact edge name and the current revision. The review flow uses the existing Studio proposal approval.

The selected edge's other incident face gives the signed pull. The kernel verifies that the edge joins the moving face to the pull-start face of the exact original stock. It uses the existing planar box Draft reconstruction and retains the original hinge curve, both vertex IDs and the two face uses. The Draft node stores the edge name and signed pull in the current native document format. Exact-name checks protect both references during reopen and upstream edits. The command refuses ambiguous selection, a lost original reference, non-stock geometry, zero or out-of-range angles, and a collapsed wall.

## Verification

- **PASS, actual desktop Chrome WebGPU.** A real front-face click and Shift-click select `n1.side0` and `n1.side0|n1.top`. The 40 × 20 × 12 mm stock starts at Z=6. Preview, zero-angle refusal, Cancel, Apply, the −8° History edit, Undo/Redo and fresh Open operate on the same selected hinge. The inspector checks the entire native hinge record, endpoints `[4,-3,18]` and `[44,-3,18]`, coedge senses, incidence and strict closed topology. There is one body, one shell, six faces, twelve edges and eight vertices. The inward 12° result has volume 8,987.837102 mm³ and the outward −8° result 10,004.757604 mm³. All eight corners and analytic volumes agree within 0.000001 in mm and mm³. The browser freezes 1,263 source files and records zero source changes, page or console errors.
- **PASS, local MCP and Studio approval.** A proposal against a stale revision or a nonadjacent edge is refused. The valid 12° proposal leaves stock unchanged until explicit Studio approval. The approved feature equals the manually applied feature and its native hinge proof passes. Native Save and fresh Open preserve it.
- **PASS, geometry controls.** Focused kernel cases cover inward and outward angles on four signed axes, exact input and output hinge comparison, strict closure and analytic volume/normal, round-trip reconstruction, wrong pull direction, missing and nonadjacent edges, unsupported stock, invalid inputs and wall collapse.
- **PASS, affected checks.** 41 kernel, 74 Model and seven Studio tests pass. The three scoped type checks, ESLint, browser-driver syntax, diff check and Studio production build also pass.
- **FAIL, early driver checks.** The first edge click hit the original Extrude grip at its centre. The next attempt left keyboard focus on the view control. The final driver picks the same edge away from the grip and releases view-control focus before opening the command palette.
- **NOT_RUN.** Arbitrary edge directions, freeform surfaces, translated-stock Studio authoring, full local suites, mobile and live providers. The broader B-rep interaction research in #629 remains open. First mechanical CAD acceptance remains 8/10. Whole-product completion is unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for the desktop run and builds.
PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/pivot-face-browser.mjs "$OUT/final"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/draft-neutral-plane.test.mjs packages/barocss-cad/test/drafted-extrusion.test.mjs packages/barocss-cad/test/drafted-cap-offset.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command-pull api-draft-pull draft-angle-binding references toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback
```

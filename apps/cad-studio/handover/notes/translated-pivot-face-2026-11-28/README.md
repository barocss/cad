# D2085 — Keep a Pivot face hinge on translated stock

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `ef25cee44900a355846615201daa37178ef0144a`.

Pivot face now accepts an original rectangular extrusion after authored Move features. It follows each preceding solid Move reference to the original extrusion. The recipe targets the current Move output and keeps the original face and hinge names. The existing kernel checks the translated native face and its incident edge before it applies the signed angle.

## Verification

- **PASS, baseline reproduction.** On the base product, desktop Studio selects the original planar face and straight edge of the two-Move stock. The palette leaves Pivot face unavailable. The native source is one valid rectangular solid and the file stays unchanged.
- **PASS, actual desktop Chrome WebGPU.** The same picks now preview and apply 12°. Studio then changes the original height from 12 to 16 mm and the first Move Z from 14 to 20 mm. Undo and Redo restore the corresponding documents. The final native Save and fresh Open retain the angle, original names, both vertex IDs, curve and edge IDs, and both incident face uses. The run retains 1,262 frozen source files with zero page errors, console errors or source changes.
- **PASS, native geometry.** The fixed 40 mm edge moves from Z=34 to 38 to 44 mm at Y=−23. Its name is `n1.side0|n1.top` and its native edge is `n3_e2` throughout. Independent corner coordinates and analytic volumes agree within 0.000001 in mm and mm³. The volume is 8,987.837102 mm³ at height 12 and 11,711.710404 mm³ at height 16. The Move edit preserves volume. Every native read finds one strict closed solid, six faces, twelve edges and eight vertices.
- **PASS, local MCP.** The same exact face and hinge names on the translated source return a pending Pivot face proposal with the independently calculated volume change. The source feature tree remains unchanged prior to approval.
- **PASS, affected checks.** 70 Model tests and seven Studio tests pass. Model and Studio type checks, scoped ESLint, browser driver syntax, diff checks and Studio production build pass.
- **FAIL, early driver setup.** One run used an invalid import alias. A second used the Extrude output key in the fixture. The final fixture uses the terminal Move output key that Studio saves.
- **NOT_RUN.** In-place assembly poses, arbitrary rotations, translated-stock proposal approval in Studio, full local suites, mobile and live providers. #629 still covers wider direct editing. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for the desktop run and build.
TRANSLATED_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/translated-pivot-face-browser.mjs "$OUT/baseline" --baseline
TRANSLATED_PIVOT_FACE_FROZEN=1 node apps/cad-studio/test/translated-pivot-face-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test draft-command-pull api-draft-pull references toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp draft-neutral-feedback
```

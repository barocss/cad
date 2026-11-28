# D2133 — Measure the surface area of a spherical cube Fillet

P5 [row 07](../../roadmap-rows/07.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md) · [#12](https://github.com/barocss/cad/issues/12) · Base `25a877ec0d484f761222f420ee3c08319438fd7e`.

The current constant circular Fillet already builds eight spherical corners when it rounds all twelve edges of a cube. Its volume passes the issue's relative 10⁻⁹ target. Its numerical surface integral exceeds that tolerance. The verified twelve-cylinder and eight-sphere branch now records analytic area on the exact output B-rep of a certified cardinal cube. The original supports and the final strict B-rep must qualify at the stated roundoff and edge-gap margins. Geometry, native names and mass calculations retain their existing paths. A transformed or copied B-rep and a caller with explicit integration options use the general area reader.

## Verification

- **PASS, baseline reproduction.** Actual desktop Studio approves an R2 Fillet over all twelve exact original edges. Both the result and fresh Open measure 2,189.4577608114373 mm² versus an independent 2,189.4512719466766 mm². The relative area error is 2.964 × 10⁻⁶. The strict 34-face result passes, and its volume is 7,804.696111295918 mm³ against 7,804.696111127531 mm³.
- **PASS, actual desktop candidate.** Local MCP stages the same Fillet for explicit Studio approval. Preview and Hide preserve the part. Approve, Undo, Redo, Save and fresh Open pass. R2 now measures 2,189.4512719466766 mm². The native B-rep SHA256 remains `02203d1c346b7812faa52d4b17e0cdc0b5a35a8e6c2221ed95bbe0f11f68f896`. A real radius edit to R2.5 reports 2,135.398163397448 mm² and 7,699.022781029336 mm³. Undo, Redo, the Selection inspector and a second fresh Open confirm the current result. The baseline and candidate runs freeze 1,276 and 1,278 files with no source changes, page errors or console errors. The R2 authored files differ only in proposal and history timestamps.
- **PASS, independent checks.** With inner side `a = L − 2r`, the area is `6a² + 6πar + 4πr²`. Two native radii agree within 10⁻⁹ relative. Explicit quadrature, a shallow B-rep copy, a moved B-rep and a partial mitred finish exercise the original area reader.
- **PASS, affected checks.** 86 kernel, 56 Model and 38 Studio tests. Kernel emit, three type checks, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0.
- **FAIL, corrected setup and implementation.** The first MCP fixture used `r` instead of `radius`. The first internal guard used a variable scoped to its caller. The final driver uses the released command field and the final guard reads the local operation options.
- **NOT_RUN.** Generic rounded boxes and other corner families at the tighter tolerance, full local suites, mobile and live providers. #12 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
ROUNDED_CUBE_AREA_FROZEN=1 node apps/cad-studio/test/rounded-cube-area-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
ROUNDED_CUBE_AREA_FROZEN=1 node apps/cad-studio/test/rounded-cube-area-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{edge-finish,part-model,box-shell,part-shell-walls,part-opening-pair-shell-walls,mass-pole-cap,mass-pole-trims,brep-mass-translation}.test.mjs
pnpm --dir packages/barocss-cad-model test native-box-top-fillets mass.test api-mass-provenance native-mass-wire toolset
pnpm --dir apps/cad-studio test mass-provenance native-mass-client pinned-mass-lifecycle fillet-radius-mode-history toolset-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

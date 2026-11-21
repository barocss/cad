# D1562 — Measure external-axis Screw AP214 round trip

2026-11-21 · P2 · [Roadmap row 13](../../roadmap-rows/13.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 00015bce2240dbd2735fc1e9fb7580943d3939d8.

Measure both handed versions of the same 16-station external-axis rectangular Screw. Export the Studio AP214 bytes, verify the serialization with the independent Python Part 21 reader, and open the same bytes in a fresh Studio context. The positive file starts from the D1561 approved +360° Screw. The negative file starts from the D1560 manually edited −360° Screw. Pitch and advance are both 56 mm.

- **PASS, actual desktop Studio WebGPU.** Both exports disclose AP214 B-rep in millimetres and the absence of native feature history, semantic PMI and named datum transfer. The current document stays exact after export. Each fresh Open displays one native closed solid, six faces, twelve edges and eight vertices, with volume 5,376.154360963081 mm³. Native history and proposals are absent from the imported model as disclosed. Both frozen runs report zero runtime errors, console errors and source changes.
- **PASS, independent AP214 read.** Resolve all references and verify oriented edge loops, the assigned millimetre context, closed-shell topology, four compact cubic rails and their paired ruled support poles. Sample the serialized rails to recover all four +360° and all four −360° windings. The greatest station errors are 1.812e-14 and 1.465e-14 mm. Independently integrated section volumes are 5,376.1543609630735 and 5,376.154360963074 mm³ and agree with the stored and native values to 1e-7 mm³.
- **FAIL, display parity.** Both native files display the 1,712-triangle structured Screw grid. The reopened files use the coarse packet with 212 uploaded vertices and no structured detail. The silhouettes and shading show visible facets. The independent file and native measurements above continue to pass.
- **PASS, affected checks.** Scoped ESLint, browser syntax, independent Python graph and numerical checks, and Git diff. The earlier triangular and centered rectangular AP214 artifacts also pass the updated oracle. No product source changed.
- **NOT_RUN.** A refined imported-body candidate, WebGL2 for import, third-party CAD application, geometry beyond the two fixtures, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome, Playwright and Python. Gate each heavy run. Keep AP214 files and evidence outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/positive" "$D1561/reviewed-smooth-screw-positive360.bcad" --screw-positive
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/negative" "$D1560/smooth-screw-negative360.bcad" --screw-negative
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/positive/approved-turn-from-studio.step" --screw-positive
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/negative/approved-turn-from-studio.step" --screw-negative
git diff --check
```

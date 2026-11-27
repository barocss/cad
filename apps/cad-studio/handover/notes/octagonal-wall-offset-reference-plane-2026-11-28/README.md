# D2098 — Link a convex polygon wall Offset to a parallel plane

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#17](https://github.com/barocss/cad/issues/17) · Base `80309b0415347c3f839fe3dce912baac09d77490`.

Offset face offers To plane on an admitted original straight, upright, uncut convex polygon wall in Studio and in History. The existing binding stores the donor body, face and native witness. Each rebuild resolves both exact solids, checks the original donor and computes the signed distance. The D2097 kernel route rebuilds the wall with its adjacent supports and native incidence intact.

## Verification

- **PASS, baseline reproduction.** Actual desktop Chrome WebGPU selects the exact front wall of the 10 mm high octagon. Distance previews successfully. The previous HUD has no To plane mode.
- **PASS, actual desktop candidate.** A perpendicular donor face refuses before Apply. The antiparallel donor at Y = −2 mm gives +2 mm Offset and 3,080 mm³. A +4 mm Move of the donor changes the saved Offset to −2 mm and 2,600 mm³. History repicks the donor's other original face at Y = 1 mm and gives −1 mm and 2,750 mm³, with the same Offset feature ID. Undo, Redo and Save/fresh Open preserve the final binding. A donor that collapses an edge at +6 mm refuses. A file with the same donor ID and face name but a different donor support also refuses. Both leave the current part intact.
- **PASS, native geometry and regressions.** An independent rational section oracle agrees with the Studio and native volume to 0.0000001 mm³ in all four accepted states. The supporting planes coincide exactly. The 16 original vertex IDs, 24 edge IDs and 48 parameter-curve owners retain incidence. Studio also repeats the D2097 triangle and octagon Distance cases and the previous oblique hexagonal To plane case. The four final runs freeze 1,268 or 1,271 files each, with zero source changes, page or console errors.
- **PASS, affected checks.** The 30 native reference controls, 121 Model tests, 10 Studio tests, both type checks, scoped ESLint, driver syntax, diff checks and Studio production build pass on Node 22.19.0. A revision-pinned local tool binds a triangular wall through the same path and rebuilds it when the donor moves.
- **FAIL, corrected verification setup.** The first octagon oracle used its distance variable before assigning it. A second run accepted the product's intended stale-reference refusal, then timed out on the old toast wording. The final driver computes the signed octagon distance and checks the current Studio message and unchanged document.
- **NOT_RUN.** Rotated and derived source bodies, desktop Agent proposal approval for this binding, full local suites, mobile and live providers. The wider #17 acceptance remains open. The first mechanical CAD baseline remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected checks under the heavy gate.
D1265_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-to-plane-browser.mjs "$OUT/baseline" octagon --baseline
D1265_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-to-plane-browser.mjs "$OUT/candidate-verified" octagon
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/distance-control"
D1265_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-to-plane-browser.mjs "$OUT/hex-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{polygon-wall-offset,prism-wall-offset}.test.mjs
pnpm --dir packages/barocss-cad-model test offset-to-plane offset-face native-offset-face references toolset tool-contract
pnpm --dir apps/cad-studio test offset-hex-side-feedback toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

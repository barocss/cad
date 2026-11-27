# D2100 — Offset one original rectangular extrusion wall

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#17](https://github.com/barocss/cad/issues/17) · Base `5285214044dd4d4b65f79ec256eb13fdcb515a5c`.

The Distance command stores one native Offset on a wall of an original upright zero-draft rectangular extrusion. It moves four exact corners along the signed outward axis, preserves the other supports and transfers their original trim ownership. The native operation validates the authored rectangular sketch and actual closed solid. Saved legacy sketch, extrusion and Boolean recipes can still open and edit.

## Verification

- **PASS, baseline reproduction.** Actual desktop Chrome WebGPU applies +2 mm on the original front wall of the 40×30×20 mm box. The legacy command has the correct 25,600 mm³ result. It creates a sketch, extrusion and Union, and changes the original 12-edge native incidence to 20 edges.
- **PASS, actual desktop candidate.** The same pick previews, cancels and applies +2 mm with one native Offset. History refuses −30 mm at the opposite support with the accepted result intact. It applies −2 mm, which survives Undo/Redo, native Save and fresh Open. The D2097 triangle and octagon Distance control also passes. Each final desktop run freezes 1,268 files and reports zero source changes, page errors or console errors.
- **PASS, independent native geometry.** `V = 800(30 + d)` gives 25,600 and 22,400 mm³. The original front and fixed supports have the expected signed equations and the independent corner coordinates match. Both results retain the six native face owners, twelve edge owners and twenty-four pcurve owners in one strict closed solid. Native tests exercise the signed motion on all four walls and verify the opposite corners and edges, first collapse, coordinate range and authored ancestry. A downstream coordinate Split at X = 9 mm after +2 mm yields 5,760 and 19,840 mm³, with independent centroids and native reopen. The earlier box cap and tilted Replace native byte controls pass.
- **PASS, affected checks.** The 63 Kernel tests, 123 Model tests, 21 Studio tests, emit, all three type checks, scoped ESLint, driver syntax, diff checks and Studio production build pass on Node 22.19.0. The Model checks include a revision-pinned local Agent command and editing a reopened legacy side Offset.
- **FAIL, corrected verification assumptions.** The first browser baseline expected a refusal and timed out because the legacy geometry already previewed. The repeat applies it and records the three-node recipe and changed edge ownership. The first focused native tests also corrected signed-zero comparison, the exact coordinate-limit expectation and an earlier assertion that wall Offset was unsupported. Scoped lint also identified an unused destructured point in the test. The renamed binding and focused rerun pass.
- **NOT_RUN.** Linked To plane for the new box wall, repeated native Offset on derived stock, desktop Agent proposal approval for this exact feature, full local suites, mobile and live providers. The wider #17 acceptance remains open. The first mechanical CAD baseline remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected checks under the heavy gate.
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/baseline-legacy" box --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/candidate" box
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/polygon-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{box-wall-offset,box-wall-replacement,drafted-cap-offset,prism-wall-offset,polygon-wall-offset}.test.mjs
pnpm --dir packages/barocss-cad-model test native-offset-face offset-face offset-hexagonal-wall offset-to-plane references toolset tool-contract
pnpm --dir apps/cad-studio test offset-cap-feedback offset-collapse-feedback offset-plane-pick-feedback offset-face-launch-view offset-hex-side-feedback toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

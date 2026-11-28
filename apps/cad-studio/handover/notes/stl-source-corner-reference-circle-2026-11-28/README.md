# D2156 — Show original STL corner occurrences for reference circles

P4 [row 16](../../roadmap-rows/16.md) and [row 26](../../roadmap-rows/26.md) · [#273](https://github.com/barocss/cad/issues/273) · Base `e5cbbe2370ec09621ebc146c09c264b10123a312`.

A current clean single-piece STL import can show the file corner occurrences welded into each visible evaluated endpoint used for a reference circle. STL supplies a sequence of triangle corners. The labels use one-based file order and show the total count. The import's existing index buffer preserves that occurrence mapping. The private live document mark is granted after the import is accepted, within the existing 5,000-triangle preview limit and only when native diagnosis leaves the imported vertex and triangle counts intact. A second native weld can change ownership, so its result keeps the previous evaluated-point measurement without file occurrence labels.

## Verification

- **PASS, actual desktop and independent source reader.** The 32-triangle binary fixture gives the three groups `[7, 10, 18, 80, 87, 89]`, `[8, 15, 17, 31, 34, 42]` and `[6, 14, 25, 28, 37, 40]` from direct reads of its binary corner coordinates. Actual viewport clicks display six occurrences for each of the three points. The same indices appear for both centimetres and millimetres. The cm result stays centred at (20, 0, 5) mm with radius √425 mm and diameter 2√425 mm. In the mm import the radius is one tenth of that value. Camera change, reset and source replacement preserve or clear the active picks according to their current owner.
- **PASS, attribution refusal and native persistence.** A synthetic variant moves one source corner by 0.000002 mm. Import retains the additional position and the native weld merges it. Actual Studio retains evaluated reference measuring and omits source labels. Save changes no document geometry. Reopening the same native snapshot in the same browser context and in a fresh context still measures its evaluated points without reviving source labels. No new file field or importer geometry is written. Baseline and final desktop passes have zero source changes, page errors and console errors.
- **PASS, affected checks.** 26 Model and 29 Studio checks, Studio TypeScript, scoped ESLint, driver syntax, Studio production build and diff check pass. An independent ownership audit identified the secondary weld boundary before final validation.
- **Corrected test failure.** The first millimetre browser check used the centimetre fixture's screen aim point. Its corner click timed out. The final driver uses the matching unit scale for both the vertex and interior aim point.
- **NOT_RUN.** Per-occurrence raw decimal or byte display, OBJ, repaired STL, multi-piece files, the wider #273 fixture matrix, mobile and full local suites. #273 remains open. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
MESH_CIRCLE_FROZEN=1 node apps/cad-studio/test/mesh-circle-browser.mjs "$OUT/baseline"
MESH_CIRCLE_FROZEN=1 node apps/cad-studio/test/mesh-circle-browser.mjs "$OUT/stl-final" --stl-sources
pnpm --dir packages/barocss-cad-model test mesh-import mesh-circle measure
pnpm --dir apps/cad-studio test mesh-circle mesh-import-ownership vertex-pick measure-quantity
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

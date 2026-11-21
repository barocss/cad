# D1621 — Extrude a convex polygon to an original lower annular cap

P1, row 07, [#222](https://github.com/barocss/cad/issues/222). Base `4946019273085fdff93f2213f597329c4b1ef790`.

A literal convex XY polygon with three to eight points can terminate on the original lower cap of a supported coaxial tube. Keep the existing native support checks and radius margins. The outer disk must contain every projected vertex. The inner bore must lie outside the convex polygon, and its protected radius must clear every finite edge. The bore check compares exact squared distances on the represented coordinates. The recipe retains the original lower face and produces a separate solid.

- **PASS, desktop Studio WebGPU.** With R12 outside and R4 inside, the triangle [(0, 5), (5, 0), (8, 8)] mm is refused. Its vertices clear the bore and its first edge crosses it. The triangle [(0, 7), (7, 0), (8, 8)] mm clears the bore. Its bounding rectangle encloses the bore centre. Select the same original `n1.bottom` face on output `n2`, apply, Undo and Redo. Move the target from Z20 to Z28. Save and fresh Open retain the target reference and rebuilt solid.
- **PASS, independent geometry.** The test triangles' first-edge distance squares are 12.5 and 24.5 mm², against the bore radius squared of 16 mm². The accepted triangle area is 31.5 mm². Its strict native solid volumes are 630 and 882 mm³ at heights 20 and 28 mm. The final centroid is (5, 5, 14) mm, and the reopened geometry matches. Both cap loops and the native R12/R4 cylindrical walls remain. The tube volume is 768π mm³.
- **PASS, controls.** Model tests cover either winding, translated XY, convex polygons with four, six and eight points, a bore enclosed by the interior, edge and endpoint contact, outer coverage and target identity. The actual rectangle control still follows the same cap from 240 to 336 mm³ and reopens exactly.
- **PASS, affected checks.** 76 Model and 12 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Both Studio runs check 1,159 frozen files with zero changed files and zero page or console errors.
- **FAIL, base capability by source inspection.** The existing annular target branch accepted only a rectangular source.
- **NOT_RUN.** Circular source to this target, general curved trims, other target axes, placed assembly targets, other renderers, exchange, mobile and full local suites. #222 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and retain screenshots and native files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude offset-face-native revision-pinned-command
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/faceEndExtrude.ts packages/barocss-cad-model/test/face-end-extrude.test.ts apps/cad-studio/test/annular-face-end-extrude-browser.mjs
pnpm --dir apps/cad-studio test extrude-end-face history-feature-apply tool-contract-mcp
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/annular-face-end-extrude-browser.mjs
D1621_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$EVIDENCE/polygon" --polygon
D1609_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$EVIDENCE/rectangle"
git diff --check
```

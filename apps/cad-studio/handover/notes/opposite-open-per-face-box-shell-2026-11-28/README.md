# D2096 — Shell an original box through its top and bottom

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `33c06438685c2e5e2cb0e04e0e11a3cf0e848b37`.

Per face Shell accepts the original top and bottom as the two explicit openings of a zero-draft rectangular extrusion. Front, Right, Back and Left each own their thickness. The feature uses the opening fields and native document version introduced by D2095. The kernel subtracts one exact rectangular through cavity and verifies both original cap rings, the four named inner surfaces and a single genus-one solid.

## Verification

- **PASS, baseline reproduction.** Actual Chrome WebGPU selects the original top and bottom of a 40×30×20 mm box. The prior Studio offers the existing uniform option. With a 2 mm thickness its native volume is 5,280 mm³.
- **PASS, actual desktop candidate.** Per face accepts Front 2, Right 5, Back 4 and Left 3 mm. A 36 mm Left edit would close the through cavity and refuses with the accepted document intact. Editing Right to 7 mm, Undo, Redo, native Save and fresh Open preserve the authored pair and four wall fields. Studio verifies the two open rings from the reopened model. Both final runs freeze 1,267 files and report zero source changes, page errors or console errors.
- **PASS, independent native geometry.** The cavity changes from [3,35] × [2,26] × [0,20] to [3,33] × [2,26] × [0,20] mm. The two material volumes are 8,640 and 9,600 mm³. The centroids are (21.777777778, 16.777777778, 10) and (23, 16.5, 10) mm. Studio and native measurements agree within 0.0000001 mm and mm³. Every result is one strict closed genus-one solid with 10 faces, 12 loops, 24 edges, 16 vertices and 48 coedge parameter curves. Both original caps are rings with two four-edge loops. The four inner supports have the authored named offsets.
- **PASS, native controls and affected checks.** Focused native tests verify both input orders, shifted original stock, another independent side-wall edit, wrong opposite pairs and cavity collapse. The earlier single-opening, uniform and adjacent-opening controls retain exact native bytes. Kernel emit, 27 Kernel tests, 69 Model tests, 62 Studio tests, scoped ESLint, Kernel/Model/Studio type checks, driver syntax, diff checks and Studio production build pass on Node 22.19.0.
- **FAIL, corrected driver.** The first baseline click caught the still-turning camera and selected a vertical face. The corrected driver waits for the Bottom camera pitch before making the actual viewport pick. The repeat proves the intended top and bottom selection.
- **NOT_RUN.** Agent proposal approval for this opposite pair, broader opening and freeform Shell families, full local suites, mobile and live providers. The larger #13 issue stays open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected build under the heavy gate.
OPPOSITE_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/opposite-open-box-wall-shell-browser.mjs "$OUT/baseline-final" --baseline
OPPOSITE_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/opposite-open-box-wall-shell-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{part-tube-shell-walls,part-adjacent-shell-walls,part-shell-walls,prismatic-cap-identity,prismatic-solid}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-walls shell-opening-history references toolset tool-contract
pnpm --dir apps/cad-studio test shell-opening-history parameter-height-finish toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

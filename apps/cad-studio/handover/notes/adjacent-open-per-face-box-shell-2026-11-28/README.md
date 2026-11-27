# D2095 — Shell an original box with its top and one side open

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `f815833c0cc934727e5d64258430448c4bebf6e6`.

Per face Shell accepts the original top and one original vertical face of a zero-draft rectangular extrusion. The two names identify the openings explicitly, and the four remaining names each own a positive wall thickness. Studio stores the original top in `opening` and the side in `secondOpening`. The kernel accepts the pair in either order and subtracts one exact cardinal cavity with the current prismatic operation. History exposes the four editable dimensions. The same command and native document version retain the existing single-opening and uniform paths.

## Verification

- **PASS, baseline reproduction.** Actual Chrome WebGPU selects the top and front of a 40×30×20 mm box. The original Studio offers a single uniform wall thickness. A uniform 2 mm example has native volume 5,856 mm³.
- **PASS, actual desktop candidate.** The two selected openings expose Bottom, Right, Back and Left wall fields. The fixture applies 2, 5, 4 and 3 mm respectively. A 39 mm Left edit collapses the cavity and refuses with the accepted document intact. Bottom 2→6 mm applies. Undo, Redo, native Save and fresh Open preserve both original names and the new Bottom value. Both runs freeze 1,267 files and report zero source changes, page errors or console errors.
- **PASS, independent geometry.** The cavity begins at [3,35] × [0,26] × [2,20] mm. The two volumes are 9,024 and 12,352 mm³. The respective centroids are (21.659574468, 18.319148936, 8.340425532) and (20.943005181, 16.886010363, 7.170984456) mm. The native result and Studio measurements match within 0.0000001 mm and mm³. Every accepted result is one strict closed solid with 12 faces, 12 loops, 28 edges, 18 vertices and 56 coedge parameter curves. The three coplanar strips at the open front and the eight-edge top rim retain the original supports. Each kept wall has its exact separately named interior support.
- **PASS, local Agent.** Local MCP supplies the original face names in reverse selection order and proposes the four wall values at the current revision. The proposal reports a change of −14,976 mm³. L1 MCP refuses direct approval. Actual Studio previews the cavity while retaining the original stock and applies it only on explicit acceptance. Native geometry matches the 9,024 mm³ desktop result.
- **PASS, affected checks.** Native tests cover the four vertical opening choices, either order, translated source coordinates, invalid ownership, collapse, downstream Save and Open, and eight byte-identical single-opening and uniform controls. Kernel emit, 23 Kernel tests, 68 Model tests, 62 Studio tests, scoped ESLint, Kernel/Model/Studio type checks, driver syntax, diff checks and Studio production build pass on Node 22.19.0.
- **FAIL, corrected assertion.** The first native harness expected `REFERENCE` for a stale name. The corrected harness checks the actual typed `REFERENCE_MOVED` refusal. All eight concentrated native tests pass.
- **NOT_RUN.** Opposite opening pairs, two vertical or bottom-adjacent openings, freeform Shell, full local suites, mobile and live providers. The larger #13 issue stays open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected build under the heavy gate.
ADJACENT_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/adjacent-open-box-wall-shell-browser.mjs "$OUT/baseline" --baseline
ADJACENT_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/adjacent-open-box-wall-shell-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{part-adjacent-shell-walls,part-shell-walls,prismatic-cap-identity,prismatic-solid}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-walls shell-opening-history references toolset tool-contract
pnpm --dir apps/cad-studio test shell-opening-history parameter-height-finish toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

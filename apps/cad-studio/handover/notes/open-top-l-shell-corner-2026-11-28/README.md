# D2116 — Choose the inner corner of an open-top L Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `2eae4fe13a1e534a4c346cf5fa33568b5143208b`.

Uniform Shell exposes Default, Sharp and Round when the original top cap of an upright, zero-draft orthogonal L extrusion is the single opening. The Model uses the same selection rule for command and History. The kernel passes the exact original top name to the existing slab producer and verifies one strict solid shell with a connected top opening, an intact outer bottom and a cavity floor at the chosen wall thickness.

- **PASS, desktop baseline and archive.** An actual Top-view pick opens `n1.top`. The previous Shell offers only Wall, and its default 2 mm result has volume 5,936.5486677646195 mm³. The candidate reopens that original recipe with the identical native digest `ee4925e7874fb86a1f87f661211c35a1a8c2f0a141e8efade990fd2ef3de74f1`.
- **PASS, actual desktop candidate.** Sharp previews and cancels with unchanged document and Undo state, then applies. The saved top face signature is preserved. The 5 mm History edit refuses and keeps the accepted shell. A Round edit succeeds, and Undo, Redo, Save and fresh Open retain the corner mode and native digest. Actual Z = 10 mm sections show the two cavity shapes. Native inspection confirms the top rim has one outer and one inner loop at Z = 20 mm, the cavity floor is at Z = 2 mm and the outer bottom is at Z = 0. The existing closed Shell control also passes. Each flow retains 1,272 source files with zero source changes, runtime errors or console errors.
- **PASS, independent native geometry.** The original L prism is 12,000 mm³. The Sharp cavity has area 336 mm² and depth 18 mm, leaving 5,952 mm³ of material. The Round cavity adds `4 − π` mm² of area, leaving 5,936.548667764616 mm³. Native results agree within 4 × 10⁻¹² mm³. Sharp has 15 faces and Round has 16. The Round face and rim use a radius-2 mm chart. Independent ray parity checks the intact floor and the open cavity. Tests cover reversed profile order, authored tags, translated height, changed thickness, exact cold reload, legacy hash controls and rejected side, bottom and multiple openings.
- **PASS, affected checks.** 54 Kernel, 34 Model and 54 Studio tests, Kernel emit, three type checks, scoped ESLint, driver syntax, production build and diff check on Node 22.19.0.
- **FAIL, corrected check.** The first candidate assertion omitted the face signature that Studio captures on an actual top pick. The final run checks its original name, plane, area and location.
- **NOT_RUN.** Local Agent approval for the new opening, other open-face or per-face corner joins, earlier readers of the new recipe, full local suites, mobile and live providers. [#13](https://github.com/barocss/cad/issues/13) remains open. First mechanical CAD stays at 8/10. Whole CAD completion stays unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources for desktop runs.
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/baseline" --open-top --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/candidate-final" "$OUT/baseline/legacy-round-native-doc.bcad" --open-top
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/closed-control" "$CLOSED_LEGACY_FILE"
node --test --test-concurrency=1 packages/barocss-cad/test/{r11-1,r11-1b,r11-1c,box-shell,capsule-shell,part-shell-walls,part-adjacent-shell-walls,part-opening-pair-shell-walls,part-tube-shell-walls,part-closed-l-shell-join,api-part}.test.mjs
pnpm --dir packages/barocss-cad-model test shell migrate toolset tool-contract
pnpm --dir apps/cad-studio test shell toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

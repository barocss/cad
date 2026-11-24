# D1907 — Move two parallel drawing dimensions together

P2 [row 11](../../roadmap-rows/11.md), [#745](https://github.com/barocss/cad/issues/745). Base `9be56bddfc8029482c8e9c1c737be0a6cff90e40`.

Shift-click a second resolved linear dimension in the same ordinary view. Drag the pair using a shared paper offset normal to their common direction. Both authored placements change in one Drawing transaction. Both dimensions keep their original direction, measured references and values. The preview and Apply compare the actual sheet text coordinates, so automatic clearance can refuse a move that would change the label spacing or move another label.

- **FAIL, previous Studio.** Shift-click selects only the second dimension. Dragging that label moves only its placement.
- **PASS, desktop Studio.** Six actual final scenes and two prior states. The pair previews a +10 mm paper move. Zero movement, Escape, a mixed orientation and sheet selection preserve the document. Apply changes both placements in one Undo operation. Redo and a fresh native Open keep both. The existing single-dimension drag still changes only the one selected placement.
- **PASS, independent SVG.** Downloaded SVG 1.0 XML shows both 64 mm texts at the original X and at Y +10 mm. Both text values, their spacing, the unselected third dimension and the dimension on the continuation sheet remain intact. The first sheet's dimensions match the accepted SVG after fresh native Open. The raw SVG carries no selection styling.
- **PASS, affected checks.** 20 Studio tests, Model type check, focused lint, Studio production build, browser syntax and Git diff check. The focused pair cases cover horizontal and vertical scale conversion, stale and duplicate identities and non-uniform label clearance. The first lint pass exposed an existing unused type and two unused note-detach bindings. A test fixture was also adjusted to use the existing endpoint reference vocabulary.
- **FAIL, retained PDF golden.** 41 of 42 related Model checks passed. The failed one-page PDF hash is the same [recorded baseline mismatch](../current-sheet-dimension-csv-2026-11-19/README.md). Actual `533e64765f48aeac1d244bc20b3aad7551feb08349b8d06ab1a69b619d5e4b66`. Expected `d280596ee08f569553b20d08e72673421cb58fed919f1e0917128369a1dcd081`.
- **NOT_RUN.** Whole local suites, movement of mixed orientations or mixed annotation types, cross-view moves, general text offsets, mobile and a new PDF qualification. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test drawing-sheets svg-xml-characters drawing-datum-targets drawing-standalone-frame-consumer drawing-composite-frame-consumer
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test drawing-dimension-group drawing-delete drawing-shortcut drawing-dimension-changes
pnpm --dir apps/cad-studio build
D1907_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-dimension-group-move-browser.mjs "$OUT/baseline" --baseline
D1907_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-dimension-group-move-browser.mjs "$OUT/studio"
git diff --check
```

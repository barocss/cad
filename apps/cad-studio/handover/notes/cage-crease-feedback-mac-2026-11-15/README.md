# D1328 — Inspect selected edge crease states (#560)

## Implementation

Model `selectedCageEdges` in `packages/barocss-cad-model/src/subd/cageEdit.ts` returns canonical endpoint IDs, finite midpoint and explicit sharp state for each selected edge (or face side), deduplicating shared sides. Invalid selection/topology/coordinates fail closed to an empty list. It never mutates or invokes editing operations.

`apps/cad-studio/src/ui/CagePanel.tsx` adds a compact, keyboard-operable details disclosure next to Picked, only while edges or faces are selected. The summary shows sharp/smooth counts; individual rows identify each edge and midpoint in mm. Long lists scroll. No permanent explanation block, renderer/highlight or native geometry changes.

## Independent Mac verification

- New Model4/4 plus related16/16 PASS: mixed state, reversed/deduplicated edges, adjacent face sides, Undo/Redo, malformed input and immutability.
- Model/Studio type checks, focused lint, production build and diff check PASS.
- Actual public30×20×16 box with4 subdivisions at1024×900 and1440×900: one smooth edge, same edge after Crease, mixed two-edge selection shows exact endpoint IDs and distinct Sharp/Smooth rows without deselecting. Details reflect current cage; prior no-op/history and mixed-change regressions remain passing.
- Cage/document Undo/Redo and native Save/fresh Open PASS. Actual1024px mixed-detail screenshot visually reviewed: both rows and Done remain visible.
- Browser driver `apps/cad-studio/test/cage-crease-feedback-browser.mjs`; Model regression `packages/barocss-cad-model/test/cage-selected-edges.test.ts`.
- Frozen receipt SHA256 `4743dcb5f5c01e489381f32f5440ae2e35f6b430667a466ab11a3632b883f218`.

## Limits / next

Light theme, mobile/AT, arbitrary cages and large-selection browser stress NOT_RUN. Full suite and unrelated generated-doc/lint drift remain separate; CI not awaited. All HOLDs persist. Next D1329/#562: disclose unapplied cage drafts at Save and protect them before New part; retain explicit Done boundary.

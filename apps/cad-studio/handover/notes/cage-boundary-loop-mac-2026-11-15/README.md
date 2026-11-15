# D1322 — Loop button selects the open boundary (#552)

## Bounded change

Model `subd/cageEdit.ts` routes the Loop/Ring panel operation through the existing `select` expansion used by double-click. An open edge uses `openRun`, otherwise the existing interior `edgeLoop`; Ring remains the existing native `edgeRing`. The first selected edge still seeds the operation, without changing geometry or creating a history step. No new boundary algorithm or Fill admission widening.

## Independent Mac verification

- Node22.19.0: new `cage-boundary-loop.test.ts` three cases plus existing cageEdit seven and depth-picking five =15/15 PASS. Both edge orientations, exact button/double-click selection equality, interior Loop/Ring native equality, no-edge refusal, geometry preservation and Fill Undo/Redo included.
- Actual public 30×20×16 SubD box, four subdivisions per side, 96 faces. Top face deletion produces95 faces and four boundary edges. Iso single edge→Loop selects the exact same four edges as actual double-click.
- At1024×900 and1440×900, both Box/Smooth: button-only single edge→Loop→Fill restores96 faces. Cage Undo/Redo and document preservation pass. Cancel is checked in three cases; final Done commits one document step and document Undo/Redo plus native Save/fresh Open preserve the resulting cage.
- Screenshot visually reviewed: four selected edges around the actual hole,95 faces and4 open edges before Fill. Final frozen receipt SHA256 `d3e871cbf4e9a8ea5b201cd2fe96cdd4a862155930dc4b48aac6f7678aed6b4b`.
- Model/Studio type-check, focused lint, Studio production build and diff check PASS.
- First driver attempt looked for Iso in the view-cube menu; Iso is a toolbar button. Only the test locator changed before the passing repeat.

## Limits / next

Interior Loop/Ring have native unit regression, not new actual UI coverage. Multiple/branching boundary families, mirror, mobile/AT and full suites NOT_RUN. Existing generated-doc drift and unrelated App lint remain separate; CI not awaited. All HOLDs persist. Next D1323/#553: show Fill/Bridge selection requirements at their existing tool help without a new persistent explanation area.

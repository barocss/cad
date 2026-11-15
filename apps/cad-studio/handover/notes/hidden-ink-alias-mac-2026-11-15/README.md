# D1401 — hidden drawing ink aliases

## Cause and bounded correction

Issue #612: on the starter-plate fixture, the native cylinder joint silhouette `n2.side0#1|n2.side0#2#2~sil` and adjacent face silhouette `n2.side0#1~sil1` describe the same 3D generator in reversed directions. Both retain hidden pieces, so drawing consumers previously emitted duplicate ink. The other hole side has the same pair.

The producer now identifies only whole, roundoff-equivalent 3D hidden runs on the same input body and supporting native cylinder joint. A face alias gets optional `ProjectedPiece.ink: false`. Original names, endpoints, curves, visibility and pieces remain intact. Detail and break clipping retain the marker; sheet and chat raster output omit the alias ink. Layout information counts actual ink. Distinct input owners, depth differences, partial overlaps, nearby lines and face-on-face coincidence do not establish alias identity.

Emptying source pieces is deliberately avoided: dimension snapping treats empty pieces as visible, and detail cropping can lose a crossing source whose endpoints are outside the disk. Existing saved references to the face alias still resolve, including the 8 mm detail dimension. Geometry, visibility sampling, fitters and native admission are unchanged.

## Focused and actual verification

- Kernel TypeScript, fast build, 12 projection tests, code-shape and targeted lint PASS. Model detail, break and ownership tests 31/31 PASS. Controls include reversed source orientation, identical nested input owners, different depths, partial overlap refusal, roundoff bounds, no B-rep mutation, source aliases crossing a detail disk, repeated break clipping, structured clone/JSON, layout score and preserved dimensions.
- Final Studio TypeScript and production Vite build PASS. A conditional object spread was mechanically changed to satisfy the existing code-shape gate, then focused tests/build were rerun. No behavior changed in that cleanup.
- Existing actual Chrome 1440 × 1000 regression PASS without relaxed expectations: eight stages covering same/split sheet, Hidden on/off, Undo/Redo and native Save/fresh Open. Front has two hidden lines, Detail has one, and both disappear when hidden lines are off. Raw source pieces remain available.
- Six actual SVG/DXF exports pass independent XML and ezdxf 1.4.5 readers. DXF AC1015 audit is clean. Stored source references and dimension 8 are unchanged. Root reviewed same-off and split-on screenshots. No page/console errors or source changes; three contexts, browser and server closed.

## Baseline failures, not silently accepted snapshots

The expanded drawing suite initially produced 444 PASS and 6 FAIL out of 450 tests. Five failures concern pre-existing golden bytes (linear-clearance, sheets PDF, drawing-standard, drawing-table, units). Running those five test files against the original main product at `1088a68392b90ab4f0ae54cd7ee019d3dfb885a4` independently produced 107 PASS and the same 5 FAIL out of 112 tests. The remaining public Move placement failure also reproduces on original main: both original and candidate produce 20 PASS/1 FAIL. A final exact-source rerun again produced 444 PASS/6 FAIL with the identical failure names; final Model TypeScript passed. These failures are not fixed here; no full drawing-suite or CI PASS is claimed.

Before any snapshot update, 51 actual SVG/DXF/PDF artifacts from the original and candidate were independently compared. XML, ezdxf entity tags and a PDF objects/content-command reader found only duplicate hidden LINE removals, with no added entities. Sheet size, dimensions and every nonhidden mark, text, style and group are exactly unchanged. Hidden survivor endpoints differ by at most 1.4210854715202004e-14, within the declared 128-EPS comparison bound. Each ordinary plate removes two duplicated lines; the table fixture removes four; hidden-off controls remove none. Existing stored goldens already differ from original main, so they are deliberately left untouched rather than absorbing unrelated drift.

## API and evidence

The only intentional public shape change is optional readonly `ProjectedPiece.ink?: false`. The official TypeScript 5.9.3 inventory candidate confirms a single seven-line member insertion; only that expected entry is updated. Other bytes are unchanged. Existing inventory drift remains: 416 changed exposures, 384 additions and 3 removals. No full API gate PASS is claimed.

- Browser: `/tmp/d1310-publish.1Wqzsz/d1401-first`; receipt SHA256 `35d65954de5dcc43bdac88f07d89c7bf8e0a167e435689e1f127c9122403a339`.
- Focused final source checks: `/tmp/cad-d1401-freeze.IKMUR1`.
- Original Move failure: `/tmp/cad-d1401-baseline.pezSaD`.
- Independent export comparison and five original golden failures: `/tmp/d1401-golden-audit`.
- Export semantic report SHA256 `0b93ee1bf539551852d367adf688eb8a55cd71210c85fb772f11b0c250a7c45b`.
- Producer SHA256 `93e40b645f92251c054a59f6e38334c9d0bd662b73e306cfa7a231f6defd0fef`; internal helper `34d30e8ea044946c9869090220ce221a1caffa20bc4329710d95c87f366d6f41`.
- Final expanded drawing and Model logs: `/tmp/d1310-publish.1Wqzsz/d1401-model-drawing-final.log`, `d1401-model-tsc-final.log`.
- Final Studio logs: `/tmp/d1310-publish.1Wqzsz/d1401-studio-tsc-final.log`, `d1401-final-build.log`.

This is not general overlapping-edge normalization, manufacturing qualification or all-geometry acceptance. #608 Rendering and existing HOLDs remain. Next: #613 automatic tolerance annotation placement; retain truthful overlap diagnostics.

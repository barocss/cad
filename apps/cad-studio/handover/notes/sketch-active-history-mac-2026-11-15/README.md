# D1356 — Draft history across Select and active outlines

Completes barocss/cad#132 including construction Trim/Extend and Offset comments. Base main: `61413c8ad22276b347eb59c7c93a8737913e9a8b`.

## Bounded correction

`src/sketch/draftHistory.ts` recognizes identical authored-order outlines repartitioned between active shape and done by Select/Dimension using existing sketchCutInputs ordering, never unordered geometry matching. Ownership remains strict; only native rectangle conversion and pending:false normalization are accepted. Document, plane, anchor, base, edited node, main IDs, band and association boundaries remain guarded. Changed coordinates, rules, IDs, construction flags, authored order and cloned nested geometry are refused. Geometry operations/document history unchanged.

## Verification

- Focused tests 12/12, Studio tsc, focused lint, production build and diff check PASS.
- Actual Mac Chrome 1024/1440: Extend closes second material outline; Select then keyboard Undo reopens same gap and Redo closes it. Source document unchanged before Finish. Finish/document Undo/Redo yield 2700/1800/2700 mm³.
- Construction Trim/Extend restores X65→55→60→55→65 after Outline 1; Outline 2 retains Undo/Redo. Final2475 mm³. Captured documents retain original rectangle, region IDs, crossing construction IDs and edited guide start ID.
- Two-profile inward Offset then Outline 1 retains draft Undo/Redo; original rectangle unchanged, only second profile receives inset. Final1992 mm³.
- All six flows include document Undo/Redo and real Save/fresh Open. Root reviewed Extend, 1024 construction and1440 Offset screenshots.
- Final receipt `d1356-second/receipt.json` SHA256 `4f7410770fb0ac7cab3e71f2de6f5b50822b72d15ebbb10a52c1d3076ec643f8`; product source frozen. First browser passed Extend but stopped on horizontal SVG Trim cue zero bounding-box height. Driver corrected to attached-cue wait; product unchanged.

No full-suite, CI, screen-reader, arbitrary curved construction or every Offset variant qualification. Existing HOLDs retained. Next D1357/#21 subject to current scope review.

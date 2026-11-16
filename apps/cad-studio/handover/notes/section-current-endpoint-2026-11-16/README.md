# Section hidden-line diagnostics use current endpoints

Bounded #34 checklist item 258. Baseline `110e146b6a300dbce41b66e1c5ba5f4dfd92c870`.

## Reproduced cause

A native 60 × 40 × 10 block has a Hole at (15,10), radius 3, and section A across front Y10. Its visible cut wall `n2.side0|section_b2.cut.side0#1` runs from (12,10,0) to (12,10,10). A saved vertical dimension measures 10 mm. Changing Hole radius to 4 moves those same-name endpoints to X11. The dimension correctly resolves to 10 mm, but DIM_ON_HIDDEN checked the saved `near` hints at X12 and falsely called the visible wall hidden.

The diagnostic now resolves each endpoint using the same `resolvePoint` contract as the dimension before checking current visibility. It does not rewrite saved references, rematch policy, geometry, drawings or schema. Missing references remain DIMENSION_LOST; genuinely hidden current endpoints still warn.

## Evidence

- Native focused 3/3 PASS: exact old/current points and edge identity, no saved-data mutation; hidden visibility control and missing reference; native front hidden Hole wall remains warned while the section warning is corrected.
- Actual Chrome baseline `/tmp/cad-section-point-baseline-01`: opening the original file has no hidden warning; editing Hole through History Diameter 6→8 creates the false warning.
- Actual fixed `/tmp/cad-section-point-fixed-01`: same actual edit has no hidden warning; first Undo/Redo and New part→in-memory .bcad Open pass. Every saved wall dimension remains 10 mm and retains near X12 hints while geometry is current. Receipt has no page/console errors, watched-source writes or downloads.
- Screenshot after editing visually reviewed: visible cut wall and retained 10 mm annotation. Other layout warnings in this compact fixture are not claimed fixed.
- Browser uses an explicit local issues module and native exports aliases. This matters because this checkout's installed Model dependency is shared with an untouched original checkout. The baseline deliberately uses that old source; fixed run selects the changed module.
- Helper/test lint PASS. Default Model type-check has native package-resolution failures in this isolated checkout; that failed run is retained, not called a full pass.

## Limits

Section leaving a Hole (item 260) still needs a separate source-versus-section explanation contract; no unproven cause was added. #34 stays open. No physical export, native-folder flow, kernel precision (#35), golden regeneration or held feature work. Original #126 eight-entry WIP is untouched.

Existing native regression also passes: section-dimensions 8/8 (63.6 s), element-callouts 4/4 (3.9 s), for 15/15 with the new focused cases. No fixture-update flag was set. Explicit-local-source production build PASS (4.99 s; existing warnings retained). The initial aliased type-check caught a test-only readonly fixture mutation; the test now constructs an immutable projection copy and final focused tests/lint pass. Production code was unchanged after the browser run.
Final affected-source type-check with explicit native exports.types aliases PASS; this is a bounded check, not a claim that default whole-package tsc passes. Final diff-check and browser-driver syntax check PASS.

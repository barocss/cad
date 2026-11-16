# Atomic fixed-plane Mirror History (#26)

New ordinary body Mirror creation records its normalized numeric plane/coordinate recipe on the terminal node. History provides Edit Mirror for an exactly replayable terminal group. The original parent is checked against the evaluated prefix before rebuilding. Plane and Plane at update the whole Translate/Mirror/Translate group together, including 3→1→3 transitions through zero. Terminal feature ID and output keys survive. Invalid plane/blank/nonfinite inputs refuse rather than silently becoming zero. No-op returns the original document; existing saved-command live ownership guards apply.

No inverse inference for legacy independent transforms, manually modified groups or downstream features. Existing individual edits invalidate the recipe through dropStaleMade. Sheet mirrored-body behavior retains its existing lowering without the new recipe. The editor explicitly describes a fixed numeric plane, not a linked face. No schema version or kernel change.

## Verification

- Model focused 3/3 PASS: each group row, exact replay, zero/nonzero identity, reopen, stale document, legacy/manual/downstream refusal, native three-axis signed-offset bounds and volume oracle.
- Studio History 39/39 PASS: grouped admission and current worker/document ownership.
- Model/Studio TypeScript and affected lint PASS; production build 4.03s PASS.
- Actual Chrome `mirror-history-browser.mjs` PASS: YZ40 creation, XY20 edit, XY0 contraction, XZ−10 expansion, Undo/Redo after each, ID/output preservation, strict B-rep/independent bounds/volume, in-memory file reopen, invalid empty coordinate refusal and Cancel. No downloads/runtime errors. Final screenshot visually reviewed.
- Initial driver selected hidden internal History row3 and timed out before editing. The grouped UI actually exposes row4; a mistaken-path launcher repeated that driver once. Corrected representative-row selection then passed without product changes.
- Wider substring `sheet` regression: 37/38 PASS including sheet Mirror. The unrelated drawing-sheets plain PDF golden failed with actual `533e64765f48aeac1d244bc20b3aad7551feb08349b8d06ab1a69b619d5e4b66` versus expected `d280596ee08f569553b20d08e72673421cb58fed919f1e0917128369a1dcd081`, matching the already recorded remaining-validation-triage-2026-11-16 finding. No golden replacement or PDF/HOLD expansion.

#26 stays open for its other Split/Align criteria and broader Mirror limitations. Protected #126 WIP and HOLDs preserved.

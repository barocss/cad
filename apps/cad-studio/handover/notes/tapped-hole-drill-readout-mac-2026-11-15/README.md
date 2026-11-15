# D1364 — Tapped Hole drill readout (Mac)

Base `6f130996f0ccce24e782a17e4c4cdeeeaa80cac0`. Partial #22; umbrella remains open.

`HoleHistoryInputs.tsx` retains original placement and cosmetic thread designation while `NodeEditor.tsx` supplies the current raw/resolved draft diameter. `tappedHoleReadout.ts` shows that drill diameter and compares only a unique loaded row with the exact designation and pitch. Missing, mismatched or ambiguous rows report comparison unavailable. Blank text is not shown as zero. No inferred d-minus-pitch value, automatic geometry correction, manufacturing suitability judgment or thread renaming.

## Evidence

- Focused 9/9 (new 3 and prior 6), Studio TypeScript, scoped lint, production build and diff check PASS. Initial SSR test matched through React separators incorrectly; assertion corrected without product changes before final checks.
- Actual Chrome 1024/1440 × loaded synthetic M6 row/no-row controls: initial drill Ø5, blank unavailable, changed draft Ø4, exact loaded tap Ø5 difference or honest no-row message. Source remains unchanged until Apply, which remains permitted.
- Only radius changes from 2.5 to 2; M6×1 cosmetic designation, source row, centre and other nodes remain unchanged. Strict native B-rep stays one solid; independent cylinder-subtraction volume agrees within 1e-6 mm³. Undo/Redo and downloaded Save/fresh Open retain Ø4; restoring Ø5 returns the exact source document.
- Actual 1024 loaded-difference and 1440 no-row screenshots reviewed for readable comparison and retained model. Source frozen through browser cleanup.
- Receipt `d1364-first/receipt.json` SHA256 `f02e87b443eb2d16200bfbc28811af5de3386c013562c20b4c36d7d058c4cee2`, PASS. Subsequent actual image review is recorded here.

The row is test data, not a manufacturing specification. Parameter-resolved fallback is unit-tested, not a separate browser case. Other axes, complete #22, full-suite, CI and assistive technology are not claimed. Existing HOLDs retained. D1365 next investigates precise Hole-array miss recovery without excluding partial edge notches.

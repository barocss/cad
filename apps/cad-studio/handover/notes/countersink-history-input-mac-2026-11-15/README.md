# D1362 — Countersink History input relation (Mac)

Base `238927c4d3c1a9e0c78d1361c8a50808429aa6fe`. Partial #22 only; umbrella remains open.

## Change

`NodeEditor.tsx` and `countersinkHistoryInput.ts` mirror the existing creation rule: Countersink Ø must exceed the current hole Diameter. Raw typed values take precedence over resolved fields. A single local status linked to the outer-diameter field explains both recovery directions; Apply and Enter share the invalid-input guard. Empty input keeps existing required-number handling. No kernel, geometry or native admission changes.

## Evidence

- Focused 3/3, Studio TypeScript, scoped lint, production build and diff check PASS. Initial tsc found two malformed test-only BodyRef fixtures; corrected before final checks. Product source was unchanged by that correction.
- Actual Chrome 1024/1440, final frozen-source run: Ø4 and Ø3.75 on Ø4 bore refuse before submission, retain raw draft, source, Centre [8,12], Step [10,0] and three holes. Increasing bore diameter to equal current countersink also disables Apply. Correcting to Ø8 enables application.
- Native strict B-rep and single solid verified; independent analytic volume `19200 - 176π` for the three corrected countersinks agrees within 1e-6 mm³. Exact authored node delta only changes countersink to 8. Document Undo/Redo and downloaded Save/fresh Open retain the model.
- Actual screenshots reviewed: local numeric relationship error, invalid raw value and disabled Apply remain legible with original holes visible at both desktop widths (1024 first run, 1440 final run; same product source).
- Final receipt `d1362-second/receipt.json` SHA256 `d5993578b8b47a28fe4c7b5376d180ef81a904cdf59a1750e97a2cd47db65c9e`, PASS. First run also passed; final adds the bore-diameter edit direction after fixing test fixtures. Subsequent visual review is recorded here rather than modifying the receipt placeholder.

No other axes, broad #22 acceptance, full-suite, CI or assistive-technology claim. Existing HOLDs retained. Next D1363 investigates positive blind-hole depth feedback in the same umbrella.

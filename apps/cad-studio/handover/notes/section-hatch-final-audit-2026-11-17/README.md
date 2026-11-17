# #262 final bounded acceptance audit — 2026-11-17

This audit covers the original eight minimum contracts and seven verification groups. It does not turn prior unrelated failures into passes. Close only after the final commit is present on main, its CI succeeds, and published actual images load.

| Original minimum contract | Verified evidence |
|---|---|
| 1. Part/full-principal, independent A/B, unsupported inputs refused | UI + strict-command checks; new saved marked-field admission rejects before normalization; scope transition/whole-sheet merge now refuses unsupported assembly without deleting flags. See [admission](../section-hatch-admission-2026-11-17/README.md) and [scope](../section-hatch-scope-2026-11-17/README.md). |
| 2. Hatch only, material rings/references/datum preserved | Model native box cap areas160/200 and through-hole exact rings, nonempty datum and detail invariance; actual non-hatch export comparison in [initial evidence](../section-hatch-visibility-2026-11-17/README.md). |
| 3. Geometry identity/cache separate from display authority | sameSection unchanged; native key strips only hideHatch; reversed cached flag test and actual zero drawing requests for toggles. Current settings remain authoritative after real held response. |
| 4. One transaction, restore/failure/late/target boundaries | First Undo/Redo, exact off/on export restoration, pending-depth pointer protection; [late reply](../section-hatch-late-reply-2026-11-17/README.md) original callback FIFO across source edit/Open/New; scope and invalid Open preserve prior accepted state. |
| 5. Legacy/list/canonical/sheets/native local persistence | [Lifecycle](../section-hatch-lifecycle-2026-11-17/README.md): single legacy A and A+B exact Save/fresh Open, parent-view sheet movement and cross-sheet merge/Undo/Redo. Old-reader loss remains explicitly documented. |
| 6. Other section/detail behavior unchanged | B actual independence, exact section-derived detail and datum Model tests. No detail inheritance added. |
| 7. Common sheet SVG/DXF/PDF agree, standalone section DXF unchanged | Initial actual original Blob comparisons with narrow independent XML/DXF/PDF parsing; 1:1 section DXF byte identical. Not a general PDF or interoperability certification. |
| 8. Minimal controls and existing renderer/kernel | Checkbox and admission/commit guards only; no new renderer, kernel, GPU, schema migration, pattern library or standard approval. |

The seven verification groups are covered by the native box/hole tests, actual restoration, actual storage/sheet lifecycle, original late replies, actual output bytes, negative/admission/scope tests and existing targeted regressions. No requirement is discharged by a concept image or screenshot alone.

## Final checks and qualified failures

- Final Model hatch/admission/scope/manufacturing selection: **24/24 PASS**, Model type-check and targeted lint PASS.
- Separate adjacent saved-frame/current-contract admission selection: **16/16 PASS** before the subsequent scope-only addition; no claim that it was rerun afterward.
- Final Studio hatch/commit focused tests: **7/7 PASS**, type-check PASS, targeted small-file lint PASS.
- DrawingWorkspace full-file lint: **three existing unused-variable errors remain** (`DrawingFix`, `_leader`, `_sheet`). Not a full lint pass. New unused import was corrected; baseline occurrences were checked against parent HEAD.
- Final Studio production build: **PASS**, 3.90 s.
- Actual late-response01, admission01 and scope01: first executions PASS, original numbered receipts retained. Earlier lifecycle harness failures remain documented separately, final lifecycle04 PASS.
- Initial existing Model regression selection: **53/54**. The plain-PDF golden mismatch has exactly the previously recorded actual/expected hashes; neither expected values nor output were changed. It remains FAIL independently of this feature.

## Explicit compatibility and scope limits

The general readDrawing utility retains its existing permissive behavior. Public document Open/Save/snapshot admission now catches explicitly marked unsupported hatch fields before that utility can erase them, including nested and pending documents. Model commands and UI whole-drawing commits also prevent a new invalid assembly state from being accepted. No automatic field deletion or repair is performed.

Older builds do not know this optional field and may lose it on re-save. This feature does not promise backward round-trip preservation or lift schema5/migration HOLD. Native-folder storage, manufacturing approval, ASME PDF mismatch, unrelated general concurrency, shared GPU and every other pre-existing HOLD remain unchanged. The protected original eight-file WIP is untouched.

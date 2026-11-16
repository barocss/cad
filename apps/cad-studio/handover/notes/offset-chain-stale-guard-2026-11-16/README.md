# Legacy Offset downstream recipe guard (#98)

Parent: `e38c994ad7cf0827b3bc099eadcb07f35327712d`.

## Implemented safety path

The legacy cap Offset stores its sketch/tool at absolute source coordinates. Changing an earlier Offset could leave a later signed Offset at its old location while the solid remained valid. This patch deliberately implements the issue's **refuse before Apply** completion option, not automatic associativity/rebasing.

`offsetFaceEdit.ts` follows History dependencies from each later authored legacy Offset target to the edited feature. Before returning an edited document, it reconstructs those dependent recipes on their current prefixes and compares the stored operations (excluding command provenance metadata). A changed or unresolvable recipe refuses the upstream edit, names the downstream feature and tells the person to cancel, remove that downstream Offset, edit the upstream Offset, then recreate the downstream operation on the current cap. Unrelated bodies' recipes are not included. Unchanged input returns the original document.

## Verification

- Model Offset/plane retention suites: 34/34 PASS. The 40×30×10 box with +3 then −4 remains Z9 / 10,800 mm³. Changing +3→+1 refuses before publishing a candidate. Original and fresh native-file read both preserve the accepted document.
- Recovery model control: edit the first recipe with no downstream tool, then recreate −4 on the current Z11 cap. Result Z7 / 8,400 mm³, strict B-rep PASS. Last Offset editing remains allowed.
- Actual Chrome WebGPU 1024×900 and 1440×900: real native Open of command-generated fixture; first Offset edit identifies downstream n7 and Cancel/recreate recovery in the default HUD, Apply disabled and document unchanged. Cancel preserves Z9. Last Offset −4→−3 produces Z10; Undo Z9, Redo Z10, real Save/fresh Open preserve native and displayed results; the first-edit guard still works after reopening.
- Independent Python 40×30×height arithmetic agrees with native and worker volumes; strict native B-rep and cap bounds checked. Both-size screenshots reviewed.
- Changed-file ESLint and Studio TypeScript/Vite build PASS.

## Limits

No automatic recomputation of the downstream recipe is claimed. No schema migration, already-stale-file repair, arbitrary upstream feature edit protection or new imported-solid geometry qualification. Recovery recreation was verified at the model command layer; the browser exercised refusal/cancel and last-feature editing, not delete/recreate UI. Existing #126 WIP and all HOLD scope unchanged.

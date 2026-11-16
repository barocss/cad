# #249: secondary inch units in Model Measure

## Contract and implementation

The existing Measurement Inspector now offers None/inch, default None. Length, radius, distance, normal distance, noncoaxial axis offset and signed XYZ deltas use raw millimetres divided by 25.4; existing area uses raw mm² divided by 25.4². Angles, witnesses, coaxial classification, primary values and the viewport mm label are unchanged. XYZ now explicitly labels its original mm values. PinnedMeasurement and Interference are outside this first scope and unchanged.

Secondary lengths use four decimal places and areas six, trimming trailing zeros. Finite nonzero values that would print as zero use scientific notation; a binary-division underflow uses an approximate logarithmic scientific display rather than claiming zero. This is display formatting, not new measurement accuracy. NaN/infinite/missing inputs produce no normal secondary scalar.

A small private preference store owns only the None/inch enum, using localStorage key studio.measure-secondary-units. Its in-memory snapshot survives Inspector unmount even after storage failure, and reports session-only persistence when storage is unavailable. Missing/invalid enums default to None. Access/get/set/quota errors do not break Measure. A fresh page cannot restore a setting whose write failed. No Doc, schema, export, drawing-unit or public Model API changes; no App prop forwarding added. The focused select keeps keyboard events from model shortcuts, and Escape uses the existing Measure close callback.

## Evidence

- Focused formatter/preference/SSR/quantity/Interference tests: 12/12 PASS. Independent literals include 25.4→1 in, 12.7→0.5 in, 645.16→1 in², signed deltas, 0.0149→0.0006 in, tiny/subnormal/large finite, invalid and storage failure cases. SSR checks every Inspector scalar path, 90° unchanged and PinnedMeasurement exclusion.
- Existing Model measure tests: 16/16 PASS.
- Final Studio TypeScript and scoped lint PASS.
- Actual desktop Chrome/WebGPU first browser run PASS. Self-authored 25.4 mm cube: selected native top/bottom faces, independent expected area 645.16 mm² and gap 25.4 mm. Native inspector records n1.top index5/n1.bottom index4, distance25.4, normal distance25.399999999999995, area645.16 and volume16387.064. Panel shows 1 in / 1 in² while angle0° and viewport25.4 mm remain unchanged.
- None→inch, focus select→Escape, reentry without old picks/results, page reload/Open, New→Open, None reload all PASS. Toggling preserves complete Doc, selection, Undo/Redo/history, dirty and measurement overlay.
- Key-specific setItem refusal is controlled fault injection, not a real browser outage. Session inch survives close/reentry, warning is visible, and reload restores the previous saved None rather than claiming persistence. The fault-run remeasurement selected a planar face and an edge; it proves valid distance/length conversion, not a second independent two-face area case.
- Screenshots reviewed; final receipt has no errors, console errors, source changes or downloads, and browser/context/server cleanup completed.

Driver test/measure-secondary-units-browser.mjs uses MEASURE_SECONDARY_UNITS_FROZEN=1, PW_DIR and CHROME, shared heavy gate and a frozen checkout.

## Honest failure history and limits

Adding the mm label to XYZ first failed two existing exact-text tests (three regex expectations). Values were unchanged; expectations were updated explicitly. A new SSR fixture initially lacked required target.mesh and failed TypeScript; corrected test fixtures only, then final 12/12, tsc and lint PASS. No browser failure was hidden.

Actual radius/axes/tiny-value permutations, storage read denial (unit-tested), saved project byte/export invariance, whole aggregate suite, WebGL2 and mobile are NOT_RUN in this pass. The file format is unchanged and external Open is covered, but this is not a new Save/export proof. Keep #249 open until the remaining acceptance/file-boundary audit. Existing WIP/HOLD and shared GPU remain untouched.

Final Studio Vite build: PASS in 5.13 seconds.

## Final file-boundary acceptance

The follow-up changes only a browser driver and this record. Product code remains implementation 5416bfb932ac353deb75a927f3ed82669472b079 (CI 43973971150 SUCCESS).

`test/measure-secondary-persistence-browser.mjs`, MEASURE_PERSISTENCE_FROZEN=1: actual OPFS project Save baseline, None/inch changes with explicit repeated Save, Close/reload/fresh project Open and None restoration PASS. Each Save waits for the named inch-cube.bcad writable stream's successful close, observing the original API without replacing its behavior, before reading file bytes. This prevents a clean-document dirty flag from falsely standing for asynchronous write completion.

- All authored file contents remain exactly 472 bytes, SHA256 76a58d799116f1194d35f052858ef1df88dbf4c7c26f599c5d0a73fb3c9265b1.
- Fresh Open restores the same complete Doc and geometry; only the browser enum remains, no past measurement targets/results. Screenshot confirms inch selection with an empty Measure panel.
- Before/after/reopened native inspector results match exactly: volume16387.064 mm3, area645.16 mm2, distance25.4 mm and normal25.399999999999995 mm.
- The existing stlFor native export consumer produces identical 684-byte output, SHA256 156c6be8fcd2bcd2ce237242bb454c23791d12618e7f5535abe19d944f76e046. This is a controlled in-memory export-consumer check, not an actual Export UI/download proof or certification of every exporter.
- Final actual run has no product/console errors, source changes or downloads; context/browser/server cleanup completed. Syntax/scoped lint PASS.

The first follow-up run returned PASS but did not independently await each completed Save; review identified that evidence gap. It is retained, not accepted as proof of completed writes. The strengthened second run is the final accepted file evidence. No product change was needed.

### Minimum-contract audit

1. Existing Model Measure None/inch scope: item and between values covered by focused rendered UI plus actual face measurement; other measurement families not added.
2. Raw dimensional conversion: independent literals and actual 25.4/645.16 fixture, signed deltas/angles preserved.
3. Precision/invalid handling: focused tiny/subnormal/large/invalid tests; no alteration of original geometry tolerance or mm values.
4. Enum-only lifetime: actual exit/reentry, Escape, reload, New/Open and None restoration; no old picks/results restored.
5. Storage refusal: controlled read/write/access/quota tests and actual write-fault session/reload behavior, with explicit session-only notice.
6. Document/file separation: actual invariants and completed OPFS Save byte identity/fresh Open; controlled native STL consumer identity, no schema/sidecar/export input changes.
7. Interaction: actual select/Escape, unchanged selection/history/dirty/measurement overlay; existing PinnedMeasurement and Interference left outside this scope.

The bounded first feature contract is satisfied. Remaining whole-suite, every geometric family, actual exporter UI/download, other devices/profiles and WebGL2/mobile permutations are not claimed. Closing #249 does not remove any existing HOLD or certify native measurement accuracy beyond the recorded fixtures.

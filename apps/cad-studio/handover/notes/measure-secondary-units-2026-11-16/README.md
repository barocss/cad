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

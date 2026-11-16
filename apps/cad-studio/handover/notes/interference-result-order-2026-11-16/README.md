# Interference result ordering (#252)

## Intake and ownership

Parent: 96a221aa80235a94c000321ce3387120405234e3. Current Inspector mapped successful pairs in original enumeration order, with no ordering control. Existing dependencies are adopted: 02f1b2754 distinguishes unchecked pairs, 7deec66c2 owns current result sessions, and 73f909bb0 records actual inspected body scope. Their controllers and geometry computation are unchanged. This is a non-manufacturing, bounded result-display feature, not owner UI redesign.

Original order remains default. Largest/smallest options compare raw finite mm³ values, retain exact ties in original order, preserve record identity and never mutate the report. Defensive nonfinite inputs stay visible after finite entries rather than becoming zero; normal accepted reports already classify them as failed. Failure rows, coverage and partial/failed/empty messages remain separate and unchanged. Pair React keys use unambiguous serialized key tuples, never rank or display names.

The private InterferenceResults component owns only transient ordering and result display. Changing report identity resets ordering immediately; busy, Close and unmount also reset it. Calculation, current-session admission and explicit body selection remain with their existing owners. No saved field, external dependency, kernel/API or App commit path changes. Sort handlers only update local state; no new calculation request is coded.

## Verification

- Focused7/7 PASS: raw2/10/100/10.04/10.01/ties/0 ordering, stable identities, immutable original restoration, empty/single and defensive nonfinite retention; actual Inspector SSR partial/failed/empty/busy/default policy; existing native pair aggregation, null/failure classification and retired-response tests.
- Studio tsc, affected lint and production build PASS. Independent read review found no blocker. Full suites not run; known Vite warnings remain.
- Actual Chrome WebGPU at1024×900 and1440×900: supported 10mm boxes at x=[0,10],[6,16],[9,19], shared y/z=[0,10]. Independent interval products are400/100/700mm³; real results match. Original/largest/smallest repeated orders match their raw values. Sorting preserves document and current selection. Enter on reordered first B/C row selects those original bodies; changing order preserves the selection and focus follows the keyed row. Close→new check and Open→new check restore Original. Screenshots reviewed, errors/console errors/source changes/downloads empty. Output `/tmp/cad-interference-order-after`.

Actual run does not measure Worker request counts, exercise controlled delayed replies during sorting, duplicate display-name row activation, or serialize a fresh Save file. Those remain separate from the source proof of a pure local sorter and existing controller regression coverage. No general collision/Boolean accuracy or whole-CAD completion claim follows. #252 remains open for that final acceptance accounting.

Run from Studio with Node22/shared heavy gate: `node scripts/test.mjs interference-order interference-result`; `INTERFERENCE_ORDER_FROZEN=1 PW_DIR=... CHROME=... node test/interference-order-browser.mjs OUTPUT`. Protected #126 WIP and all HOLDs are unchanged.

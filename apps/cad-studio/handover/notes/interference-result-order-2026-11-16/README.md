# Interference result ordering (#252)

## Intake and ownership

Parent: 96a221aa80235a94c000321ce3387120405234e3. Current Inspector mapped successful pairs in original enumeration order, with no ordering control. Existing dependencies are adopted: 02f1b2754 distinguishes unchecked pairs, 7deec66c2 owns current result sessions, and 73f909bb0 records actual inspected body scope. Their controllers and geometry computation are unchanged. This is a non-manufacturing, bounded result-display feature, not owner UI redesign.

Original order remains default. Largest/smallest options compare raw finite mm³ values, retain exact ties in original order, preserve record identity and never mutate the report. Defensive nonfinite inputs stay visible after finite entries rather than becoming zero; normal accepted reports already classify them as failed. Failure rows, coverage and partial/failed/empty messages remain separate and unchanged. Pair React keys use unambiguous serialized key tuples, never rank or display names.

The private InterferenceResults component owns only transient ordering and result display. Changing report identity resets ordering immediately; busy, Close and unmount also reset it. Calculation, current-session admission and explicit body selection remain with their existing owners. No saved field, external dependency, kernel/API or App commit path changes. Sort handlers only update local state; no new calculation request is coded.

## Verification

- Focused7/7 PASS: raw2/10/100/10.04/10.01/ties/0 ordering, stable identities, immutable original restoration, empty/single and defensive nonfinite retention; actual Inspector SSR partial/failed/empty/busy/default policy; existing native pair aggregation, null/failure classification and retired-response tests.
- Studio tsc, affected lint and production build PASS. Independent read review found no blocker. Full suites not run; known Vite warnings remain.
- Actual Chrome WebGPU at1024×900 and1440×900: supported 10mm boxes at x=[0,10],[6,16],[9,19], shared y/z=[0,10]. Independent interval products are400/100/700mm³; real results match. Original/largest/smallest repeated orders match their raw values. Sorting preserves document and current selection. Enter on reordered first B/C row selects those original bodies; changing order preserves the selection and focus follows the keyed row. Close→new check and Open→new check restore Original. Screenshots reviewed, errors/console errors/source changes/downloads empty. Output `/tmp/cad-interference-order-after`.

## Final acceptance accounting

The four original verification gaps are now exercised in `/tmp/cad-interference-order-acceptance` on48eaf9c31 with the unchanged2beadae23 implementation:

- Actual Worker postMessage observation: duplicate-label three-body results sort repeatedly with the complete request trace unchanged6→6. This measures all observed worker request types, not just volume requests.
- Harness-controlled delay of a real old native volume reply: Close retires its run, a new check completes, the new result is sorted smallest-first, and releasing the old reply preserves current rows/order/document with requests10→10. The6→10 increase between phases is the explicitly requested old one-probe run and new three-probe run, not sorting.
- Three equal names are disambiguated by original keys; Enter on the reordered first row selects b3/b5, and subsequent sorting retains that selection.
- One real Save download has complete JSON equality to the accepted document, with no sort metadata. Fresh-page file Open and a new check restore original ordering. SHA256 `ed8718c8e693b9531d52add919b2cd4bba9d4fde3669a4ea74cc59dc400b622b` identifies saved bytes, not geometry accuracy.

1024/1440 ordinary flows also pass in the same run; errors/console errors/source changes empty. Screenshot reviewed. Only the requested Save downloads. Driver syntax and diff whitespace pass; product sources are unchanged, so full build/unit suites were not redundantly repeated. Existing focused tests qualify ties, defensive nonfinite, busy/empty/partial/failure reporting; the actual delayed run qualifies delivery ownership rather than an organic worker incident. Original contract is accepted at this bounded scope and #252 can close. No general collision/Boolean accuracy or whole-CAD completion claim follows.

Implementation commit2beadae230535e673f98f0fbc1d4d271681020b1 has successful GitHub Actions run[43936916525](https://github.com/barocss/cad/actions/runs/43936916525), independently read via REST. Empty commit-status arrays do not imply absent push-triggered Actions.

Run from Studio with Node22/shared heavy gate: `node scripts/test.mjs interference-order interference-result`; `INTERFERENCE_ORDER_FROZEN=1 PW_DIR=... CHROME=... node test/interference-order-browser.mjs OUTPUT`. Protected #126 WIP and all HOLDs are unchanged.

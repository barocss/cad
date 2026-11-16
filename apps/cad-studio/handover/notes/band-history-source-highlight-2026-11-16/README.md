# Band History source-edge highlights (#29)

## Reproduction and bounded change

The creation command highlighted its A/B named source rims, but History uses `BandSurfaceEdit` with id `edit`; the App's creation-only branch omitted both source selections during accepted preview. Actual Chrome on parent d13e0f64f confirmed a same-screen positive creation control (308 cyan pixels near the first rim), versus zero for History Keep, real Re-pick A, real Re-pick B and restored Keep. Baseline output: `/tmp/cad-band-history-highlight-before`; screenshot reviewed.

A private Studio adapter now recognizes the exact Band edit class as well as creation. It requires the current command document identity, retains optional source ownership and History availability, and resolves original parent/side/names against the actual displayed body order. It does not treat every `edit` as Band, borrow a same-named consumed parent, retarget references, or change geometry. App only connects current accepted/preview body displays. The existing low-level highlight resolver remains the shared implementation. Commit/cancel/preview ownership stays in App; protected DirectPanel and preview hook are untouched.

## Verification

- Focused five tests PASS: existing parent/name mapping plus creation/History, reordered displayed bodies, empty re-pick side, consumed parent, stale document, lost ownership, replaced History feature, unrelated edit and cancellation.
- Studio TypeScript, affected-file ESLint, production build PASS. Existing Vite directive/dynamic-import warnings remain; no full-suite or CI-green claim.
- Actual frozen Chrome 1440x900 PASS: creation control remains 308 pixels; History Keep/Re-pick A/Re-pick B/restored Keep show 41/41/40/41 respectively. Each re-pick first observes the empty draft, then uses real mouse picking. Accepted document remains unchanged during draft and Cancel. Flip Apply, Undo and Redo preserve exact documents. Screenshot shows the cyan source rims and matching HUD A/B. No errors, console errors, source changes or downloads. Output: `/tmp/cad-band-history-highlight-after`.
- Counts are small screen-sample observations, not geometric accuracy or full-edge-visibility claims. Existing sheet occlusion remains. No native geometry, general surface support, Save/Open or whole-issue acceptance is newly claimed.

Run from Studio under the shared heavy lane with Node22: `node scripts/test.mjs band-highlight`; `BAND_HISTORY_HIGHLIGHT_FROZEN=1 PW_DIR=... CHROME=... node test/band-history-highlight-browser.mjs OUTPUT` (add `--baseline` only on the reproduced parent).

#29 remains open. Its original blank Curve At t/Split requirement overlaps the preserved existing DirectPanel WIP, so it was deliberately not duplicated or reported complete. Broader original acceptance remains separate.

# Retain owned circle picks through constraint Undo/Redo (#21 partial)

Parent9aa36f6b6fd70c5954c9a65bdb98130f5be18b11. Original #21 line3209 requested broader circle-constraint/filter/Undo coverage. Existing outline replay retained stable edge picks only, unconditionally discarding attached circle picks even when their native side IDs remained unchanged.

Actual Chrome1024×800 baseline: Select circle1, Distance/Picked only gives2/9 rows; removing its circle-pair constraint gives1/8. Undo clears the pick and shows0/9; Redo stays0/8. Accepted document remains unchanged. This is selection/filter loss, not a failed solver or corrupted geometry. `/tmp/cad-circle-picked-undo-before` screenshot confirms the lost selection; baseline unit8PASS/new1FAIL.

## Narrow fix

Only the current outline replay path retains a circle pick when existing ordered/unique outline side IDs and segment kinds match, both circle-ID arrays match their circle counts, and their nonempty unique IDs match in exact order. Picks must be current (not parked `done`), integer and in range. No centre/radius proximity, same index without identity, automatic remapping or new public identifier is used. Existing circle IDs come from sketch attachment and reopen contracts. Point picks, parked-outline/full-draft restore, missing/duplicate/reordered IDs and changed circle counts remain unsupported and cleared.

## Verification

- Studio focused draft history13/13 PASS, including real history Undo/Redo, malformed/missing/reordered/replaced IDs, count changes, fractional/out-of-range/parked picks, point exclusion and unchanged draft. Existing multi-outline selection-partition regressions retained.
- Studio TypeScript, affected lint and production build PASS. Initial new test called history.undo/redo with OutlineStep rather than the API's current DraftStep; runtime reproduction was valid but tsc refused the test. Test-only caller corrected, final checks rerun. No product change after actual browser.
- Actual frozen Chrome1024×800 PASS: same circle pick persists2/9→1/8→Undo2/9→Redo1/8. Finish removes only the intended constraint; other rule, circle geometry, side tags and following Extrude remain exact. Document Undo/Redo restore originals. Screenshots reviewed. Errors/console errors/source changes/downloads empty. `/tmp/cad-circle-picked-undo-after`.
- Independent read review found no blocker. This is not a new geometry algorithm or native accuracy claim. Multi-outline plus circle interaction, point-pick retention, saved-file lifecycle and #21's remaining original conditions are not newly qualified; #21 stays open. No WIP/HOLD changes.

Run from Studio with Node22/shared heavy gate: `node scripts/test.mjs draft-sketch-history draft-selection-history`; `CIRCLE_PICKED_UNDO_FROZEN=1 PW_DIR=... CHROME=... node test/constraint-list-browser.mjs OUTPUT --circle-picked-undo` (add `--baseline` only on parent).

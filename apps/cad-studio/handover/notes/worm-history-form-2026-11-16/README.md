# Throated Worm History form admission (#30 partial)

The Worm gear pair command forces ZA for a throated wheel; the native throatedWormPlacement contract also rejects a ZI worm with MATE_INCOMPATIBLE. History nevertheless offered both forms. This change aligns that History field with the existing creation/kernel contract, without extending kernel support.

When the current worm's mesh.gear points to a worm-wheel, the field offers only `ZA (required for a throated wheel)`. Its setter checks the current supplied nodes and current mesh.gear, not the options captured when the editor opened, and retains the nodes if ZI is requested for that parent. Cylindrical gear parents keep both ZI and ZA. Missing parents are not guessed or repaired. Stored legacy ZI is not silently converted; the native refusal remains. Legacy-invalid-document UI repair is not qualified here. Numeric fields are unchanged.

## Verification

- Original focused tests: 2 FAIL / 2 PASS. After fix: new4 + existing editFields5 = 9/9 PASS. Cases cover creation agreement, latest-parent setter admission, changed mesh target, explicit repair via ZA, unknown parent, no mutation, numeric fields preserving form, and the native legacy-ZI refusal.
- Target lint, Studio tsc, diff check PASS. Production build4.59s PASS, existing bundler warnings remain.
- Actual frozen Studio `/tmp/cad-worm-history-browser-01` PASS. Throated ZA-only History and length66→70; Undo/Redo, in-memory native JSON reopen, closing an unapplied74 draft. Cylindrical pairing keeps both choices and evaluates ZI→ZA→ZI with Undo/Redo. Both worker volumes match a separate product evaluation within1e-6mm³; throated pair retains its enveloping-mesh note. No independent manufacturing/physical contact validation is claimed.
- Screenshot `02-throated-form-only-ZA.png` reviewed. No browser errors, console errors, source changes or physical downloads.

No App props or responsibilities were added; the existing model-side field capability owns the restriction. Existing #126 WIP, HOLD scopes, native geometry tolerances and documents are unchanged. #30 stays open for Rack pitch and V/Timing Belt inputs.

Model: `node scripts/test.mjs worm-history-form editFields`.
Studio under heavy gate with standard PW_DIR/CHROME: `WORM_HISTORY_FROZEN=1 node test/worm-history-form-browser.mjs <output>`.

# Chain-only History fields (#30 partial)

V, Timing and Flat belts previously received the chain-only Links choice. History now exposes it only when the belt references exactly two distinct preceding sprockets of its row, and the supplied document contains exactly one matching chain row. A scope-free editCommand keeps the existing structural sprocket contract. A captured setter repeats the current-node check, so it cannot write rounding after the belt/wheels/row change to an unsupported combination. Existing stored rounding is never silently stripped.

The existing model field owner receives optional drives in its document scope; Studio already passes that document. No new App props, UI ownership, schema or kernel support were introduced.

## Verification

- Original focused tests: 3 FAIL / 1 PASS. Final focused plus editFields/drive-related selection: 37/37 PASS (the runner substring also includes driven-sketch suites). Exact two-wheel guard covers malformed zero/one/three-entry arrays. Missing/mixed/mismatched wheels, missing/non-chain/duplicate scoped rows, latest-node setters and scope-free chain compatibility covered.
- Target lint, Studio tsc and final production build4.25s PASS (existing bundler warnings). Model-package tsc does **not** fully pass: unchanged `test/hole-types.test.ts:97` reports TS7022 on `changed`. New test typing was corrected and no diagnostic remains in changed files. This unrelated test was not modified; no full-package type-pass claim.
- Frozen final-source actual Studio `/tmp/cad-belt-history-browser-02` PASS: V/Timing/Flat have no Links or Apply button and show the existing no-editable-dimensions message, unchanged after Close and native JSON reopen. Chain Whole→Even still applies, Undo/Redo and reopen retain it, and closing an unapplied Whole draft preserves Even. All three evaluated bodies remain fresh. Screenshot `01-timing-no-chain-field.png` reviewed. No browser/console errors, source changes or downloads.
- Attempt01 used a hand-authored V pulley missing its mandatory bore and was correctly refused by the kernel. Added the creation command's normal bore12 to the fixtures; no product relaxation. Attempt02 completed all assertions.

No independent manufacturing validation or physical Save download is claimed. #30 remains open for Rack pitch/module behavior. Existing WIP/HOLD scopes remain unchanged.

Model: `node scripts/test.mjs belt-history-fields editFields drive`.
Studio under heavy gate with standard PW_DIR/CHROME: `BELT_HISTORY_FROZEN=1 node test/belt-history-fields-browser.mjs <output>`.

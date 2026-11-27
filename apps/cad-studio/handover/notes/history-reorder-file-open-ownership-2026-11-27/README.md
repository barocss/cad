# D2047: Keep File Open from being cancelled by a late History reorder

P1, [#5](https://github.com/barocss/cad/issues/5) (transactional feature history) and [#170](https://github.com/barocss/cad/issues/170) (document/history). Prior public base: `702ec31d600d73ba0f263707f54243b8a49ed268`. A previously requested History reorder could commit while a subsequently selected file's bytes were still reading. That edit would revoke the Open intent without an error; Studio would keep the old document with the newly reordered History instead of opening the chosen file.

History reorder now captures the same document, worker, rollback marker, shown document and Open-intent check already used by suppression. A late reply that no longer owns the action can neither commit nor show a stale refusal. The current reorder still uses the same strict evaluation and regular undoable commit. No file format, kernel, or support expansion; other History mutations are not qualified by this change.

## Verification

- Real desktop Chrome/WebGPU, unchanged browser file bytes and unchanged successful Worker reply; the test delays delivery only. Reproduced the old 8 mm plate staying open and dirty after selecting the new 12 mm file. Fixed path opens the later-selected file, and the first Undo returns to the original feature order, then Redo and native Save/fresh Open restore the new file exactly.
- Strict native and browser Worker readback agree with analytic volumes/centroids: drilled 30 × 20 × 12 mm plate with Ø4 bore, `(600 − 4π) × 12` ≈ 7049.203552627696 mm³; untouched independent Ø10 × 6 mm cylinder, `150π` ≈ 471.238898038469 mm³.
- Ordinary reorder, dependent Hole move refusal, Undo/Redo, browser project reopen and subsequent plate edit pass the original D808 control. 13 focused Model transaction/rebuild/output tests and CI-pinned Studio TypeScript 5.9.2 pass. Do not close the broader transactional feature graph issue on this scope.

[Before: old document retained](studio/before.png) · [After: selected document opens](studio/after.png)

```sh
export D808_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/history-open-fix --open-race
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/history-open-control
# On the prior source with the updated driver copied in:
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/history-open-prior --prior-open-race
pnpm -C packages/barocss-cad-model test transactions o10-rebuild chat-outputs
```

# Band pairing evidence ownership (#29)

## Reproduced gap

The command located an existing Band's evaluated pairing by edge names alone. A real Translate of its first cylinder preserves source edge names but changes the body reference; the earlier associative Band remains another live output. Public command defaults → onPick → build → native evaluate succeeds for a new Band on the translated body, yet its draft previously claimed the older Band's evaluated `2↔2 pieces → 2 patches` report. A History Flip draft borrowed the accepted orientation's report as well. Counts happen to agree in these fixtures; this is wrong result ownership, not demonstrated numeric corruption.

Parent native focused run: existing20 PASS, new ownership2 FAIL (`/tmp/cad-band-ownership-repro.log`). No fabricated body/report mutations were used to establish the reproduction.

## Bounded fix

The shared command/History pairing helper now requires both ordered parent references and edge lists, Flip, the result body key and a nonheld/nonsuppressed authored Band before showing that evaluated report. Otherwise it retains the existing source-edge-count fallback. The source parser/format is reused rather than changing schemas or adding a parallel representation. Build, pairing geometry, reference signatures, selection, command ownership and preview hook are unchanged. Protected DirectPanel and #126 worktree are untouched.

## Verification

- Model native Band tests22/22, Model TypeScript and affected-file lint PASS. Read-only review found no further blocker.
- Actual frozen Chrome1024×900: original History shows accepted pieces, Flip draft shows source-edge fallback, restoring Flip restores the matching report. Cancel preserves the document. Real viewport A′/B rim picks show b5/b3 and source counts instead of b4's report. Apply retains the old Band, stores the new parents, and Undo/Redo/in-memory reopen preserve the exact authored documents. Both screenshots reviewed; no page/console errors or downloads. Output `/tmp/cad-band-owner-final01`.
- Browser fixture is committed at `test/fixtures/band-pairing-owner.bcad`, SHA256 `f85ec3b322c8f31ef54cf1008c29ed1dc0d8759d9919fdb130300c848581d6ef`.
- Studio consumer TypeScript and production build (3.92s) PASS; existing Vite directive/dynamic-import warnings remain. No new geometry acceptance, material/thickening support, broad trim, full suites or external exports are claimed. #29 retains its separate remaining acceptance.

Run `node scripts/test.mjs band-surface` from Model; run `BAND_PAIRING_FROZEN=1 PW_DIR=... CHROME=... node test/band-pairing-owner-browser.mjs OUTPUT` from Studio, under the shared heavy lane. Node22.19.0.

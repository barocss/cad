# D2193 — Revoke a browser proposal during evaluation

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `96a394a5fe212b70ec8386ee5f84d36e28c9c4d5`.

The Studio driver calls the actual WebMCP Extrude tool in Chrome and delays delivery of a successful native Worker evaluation. The user revokes editing, then grants one new proposal on the very same document, evaluated body and revision. Delivery to the earlier tool still returns `stale_part`. It does not add a proposal or a history event. The read-only grant remains active.

## Verification

- **PASS, actual desktop Studio.** Chrome 158.0.8127.89 evaluated a 12 mm candidate from the original 80 × 50 × 10 mm part. Revocation retires the old handle. After regranting, the delivered late result returns `stale_part` and preserves the exact original document and 40,000 mm³ volume. The fresh tool stages only the requested 15 mm change, as proposal P1.
- **PASS, actual recovery.** User approval gives 60,000 mm³. Undo and Redo preserve the original pending proposal and approved documents. Browser-project Save, Close, reload and fresh Open preserve the exact approved document and body. No page errors, console errors, downloads or source changes occur across 708 frozen files.
- **NOT_RUN.** Forced Worker failure, timeout, full policy parity, live-client qualification, full local suites and mobile. This decision changes no runtime source. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-revoke.mjs" "$OUT/desktop"
git diff --check
```

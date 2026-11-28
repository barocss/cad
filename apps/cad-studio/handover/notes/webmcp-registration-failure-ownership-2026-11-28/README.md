# D2201 — Keep browser registration failures with their source document

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `e414e6ddb674728fddfbe653e8268d1425e48649`.

A browser proposal registration failure now keeps the document and scope of the failed grant. Studio clears the notice when that source ends. Once a replacement part is explicitly shared, the notice reflects its own registration state.

## Verification

- **FAIL, original.** The driver made Chrome reject one Extrude proposal registration on revision `5fb56d552edc7088`. Opening and sharing revision `31a029b31fdff14b` then showed the old failure even though both new read tools registered and the replacement had not requested a proposal.
- **PASS, fixed desktop.** In Chrome 158.0.8127.89 a controlled failure of the second read registration retired the first tool. A fresh share registered both tools once. A controlled proposal registration failure kept both read tools and the original geometry. The 12 mm replacement opened and shared with the current revision and no inherited notice.
- **PASS, approval and ordinary Studio.** A new 15 mm proposal on the replacement required explicit approval and produced 60,000 mm³. Browser project Save, Close, reload and fresh Open preserved the accepted document. The unflagged desktop control opened an ordinary part with browser tools absent. There were zero page errors, console errors, downloads or source changes.
- **PASS, small local gates.** 18 focused Studio tests, Studio type check, scoped lint and whitespace.
- **NOT_RUN.** Delayed successful registration across a document switch, explicit secure-context and Permissions Policy controls, full local suites, new local production build, external browser clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-registration-failure.mjs" "$OUT/desktop-baseline" --baseline
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-registration-failure.mjs" "$OUT/desktop-fixed"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/desktop-unavailable" --unsupported
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
git diff --check
```

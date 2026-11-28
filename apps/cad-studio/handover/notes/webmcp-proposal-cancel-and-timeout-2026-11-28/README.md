# D2200 — Release a cancelled or timed-out browser proposal call

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `a29211e6cde2732526a5575a48996255b8281946`.

A browser call now releases its proposal evaluation wait when the caller aborts, the registration ends or the 30-second deadline expires. A timed-out active call returns `proposal_timeout`. A fresh call can use the same unspent grant. The shared Worker stays available and can deliver its own replies in order. The existing current-source guard and explicit Studio approval still control whether a change enters the document.

## Verification

- **FAIL, original.** Chrome received `AbortError` after the caller cancelled a real 12 mm proposal on a 10 mm rectangular Extrude. A valid retry returned `proposal_pending` until the held native reply arrived. The 40,000 mm³ source and prior history were preserved.
- **PASS, actual execution abort.** Chrome 158.0.8127.89 cancelled the call while the successful native reply was held. The same grant sent the 15 mm retry to the same Worker before the old reply was delivered. The old result did not become a proposal. The app staged only the 15 mm result after ordered delivery.
- **PASS, actual timeout.** The same trial without caller cancellation returned `proposal_timeout` after 30,003.7 ms. Read sharing, the 40,000 mm³ model, and history stayed available. The successful retry remained subject to user approval and produced 60,000 mm³. Undo, Redo and fresh project Open passed for both trials. The ordinary desktop proposal regression also passed. No page errors, console errors, downloads or source changes occurred in the successful runs.
- **FAIL, first fixed driver.** It delivered a newer Worker reply before the held older reply. That violated the mesh transport ordering and caused a later acceptance to refuse with `Evaluation lost`. The corrected driver holds both replies, proves they came from the same Worker, and delivers them in original order.
- **PASS, small local gates.** 18 focused Studio tests, Studio type check, scoped lint and whitespace.
- **NOT_RUN.** Full local suites, a new local production build, external browser clients, paid live qualification and mobile. The trials measure browser call release and late result handling while the shared Worker continues to run. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-cancel.mjs" "$OUT/desktop-baseline" --baseline
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-cancel.mjs" "$OUT/desktop-abort"
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-cancel.mjs" "$OUT/desktop-timeout" --timeout
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-default"
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
git diff --check
```

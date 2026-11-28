# D2197 — Retire a browser proposal when Studio autonomy changes

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `19ac6ed69cf3c88977f3ceab836715fc365538dd`.

Changing Studio autonomy now invalidates the current browser proposal grant synchronously. The registration is removed and the existing current-grant check discards a pending result before it can stage a proposal. The shared read tools stay available. A new grant at the selected level permits one proposal and still needs explicit Studio approval.

## Verification

- **FAIL, original desktop behavior reproduced.** Chrome 158.0.8127.89 held the successful real Worker reply for a 12 mm height proposal on a 10 mm rectangular Extrude. The user changed L2 to L1 before delivery. The old grant staged P1 on the same revision. The accepted model remained 40,000 mm³.
- **PASS, fixed desktop behavior.** The same change retired the grant. Switching back to L2 and then to L1 did not restore it. A new explicit grant was available on the same revision. The held result returned `stale_part` and the old handle was no longer callable. The exact original model and history remained, and the browser summary revision stayed available.
- **PASS, positive and regression paths.** The fresh 15 mm proposal required approval, then produced 60,000 mm³. Undo, Redo and fresh project Open preserved the expected documents. The committed rectangular browser driver verified autonomy revocation and the existing same-revision Open race. There were zero page errors, console errors, downloads or frozen-source changes.
- **FAIL, first combined driver.** It repeated an identical proposal candidate, which hit the evaluated-part cache. The second request had no new Worker reply to hold. The final driver uses distinct heights for the autonomy and Open cases.
- **PASS, small local gates.** 18 focused Studio tests, Studio type check, scoped lint and whitespace.
- **NOT_RUN.** Full local suites, production build at this change, broader policy parity, external browser clients, paid live runs and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-policy.mjs" "$OUT/desktop-baseline" --baseline
BROWSER_EXTRUDE_FROZEN=1 node "$OUT/browser-proposal-policy.mjs" "$OUT/desktop-fixed"
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-default"
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
git diff --check
```

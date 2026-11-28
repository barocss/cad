# D2208 — Show browser proposal evaluation on the grant control

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `833ad5e12fd60907dc2e0ccc5e3b32a0db58c63d`.

The active browser proposal button shows **Evaluating…** and exposes its busy state while the Worker evaluates that call. Clicking the pressed control still revokes its grant. The progress belongs to the individual call, so completion of an old call can clear only its own status.

- **FAIL, original.** Chrome had a native 12 mm Extrude result waiting to be delivered. Studio's highlighted proposal button still read **Propose** and exposed no busy state, although a duplicate call returned `proposal_pending`.
- **PASS, actual desktop.** The active grant showed **Evaluating…**. Clicking it removed the tool and its busy status. The late 12 mm result left the original 40,000 mm³ document unchanged. A new grant evaluated 15 mm on the same Worker. Releasing the old result first kept the new evaluation visible, and the duplicate returned `proposal_pending`.
- **PASS, approval and reopen.** The new result staged one proposal and cleared busy state. Aborting its signal after the successful staging response kept the single recorded proposal. Studio approval produced 60,000 mm³, and Undo, Redo and project reopen passed. The checked-in autonomy-change regression confirms that the busy state clears there too.
- **PASS, checks.** Actual Chrome 158.0.8127.89 had zero page errors, console errors, downloads or frozen-source changes. 18 Studio tests, Studio type-check, scoped lint and whitespace passed.
- **NOT_RUN.** Cancellation between staging and delivery of a lost client response, full local suites, external natural-language agent clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/run.sh" desktop-before --baseline
bash "$OUT/verify.sh"
git diff --check
```

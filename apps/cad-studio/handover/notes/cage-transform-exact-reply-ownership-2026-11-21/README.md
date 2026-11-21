# D1502 — Require the exact current cage result after a transform drag

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base `eddd6dc64b8916694f14ac6291af6caa83af9882`. This desktop regression changes no product source.

The test intercepts the browser Worker message handler to hold real successful preview replies. It compares each request cage with the selected Studio cage and checks that the result revision matches the request. It does not replace the engine calculation or modify the reply.

## Verification

- **PASS, actual desktop Studio with controlled reply delivery.** Drag Uniform scale by 1.1× (revision 10) and then by 0.8× on the same selected quad (revision 11). Each release adds one cage step, with a distinct result. Deliver revision 10 while revision 11 waits. Done remains blocked and forced pointer activation and Enter leave the accepted document and latest cage intact.
- **PASS, current acceptance and native files.** Deliver revision 11. Done becomes available and applies its exact cage. One document Undo restores the unedited part. Redo, native Save and fresh Open restore the accepted cage.
- **PASS, document replacement.** Make a third drag after fresh Open and hold its real reply (revision 8 on the new page). Confirm discard and New part, then deliver that reply. The replacement remains empty with no cage session. Undo restores the previously accepted cage without a draft; Redo restores the replacement.
- **PASS, affected checks.** 30 Studio tests, browser syntax and Git diff checks.
- **NOT_RUN.** Transport errors, OS cancellation of a held local turn, alternate renderers, mobile and full local suites. No production type/build rerun for this test-only change. #625 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-commit-readiness cage-transform-draft gizmo gizmo-state-presentation
node --check apps/cad-studio/test/cage-transform-exact-ownership-browser.mjs
git diff --check
cd apps/cad-studio
CAGE_EXACT_OWNERSHIP_FROZEN=1 node test/cage-transform-exact-ownership-browser.mjs "$EVIDENCE"
```

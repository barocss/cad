# D1781 — Extract Studio notice and recovery rendering

P4 Studio maintenance, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `9dd6197460f9e83de1746ad3dd333bc00cd1819e`.

Move the visible recovery offer, dependent deletion dialog slot and ordinary notice into one Studio component. Keep document replacement, mesh blob recovery, worker retry and notice eligibility in App. Preserve the order, DOM classes, accessible labels and handlers. App.tsx goes from 3,062 to 3,046 lines.

- **PASS, actual desktop Studio, notice.** Raise the Offset Face notice and pick a face through its text. The Dismiss button removes the notice and retains the face selection. The pointer hit and dismissal match the base.
- **PASS, actual desktop Studio, recovery.** Restore an unsaved 10 × 10 × 11 mm part from the real browser recovery copy after reload. The offer remains through opening a separate document and copying its body. Restore clears that clipboard scope. Undo and Redo traverse the prior and recovered documents. Fresh Copy restores Paste. The four independent body oracle outputs match byte for byte.
- **PASS, before and after.** Three notice states and two observations match exactly. All nine recovery states match after normalizing the saved-at timestamp in the two recovery notices. The four desktop runs have zero source changes, page errors and console errors.
- **PASS, affected checks.** 47 Studio tests, scoped ESLint, Studio production build with types and Git diff check.
- **FAIL, recovered lint.** The first scoped lint run found two unused imports in App after the markup moved. Remove them and rerun scoped lint and the production build.
- **NOT_RUN.** Full local suites, missing mesh blob recovery, alternate GPU backends, mobile and live providers. Issue #44 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run each desktop command on the base and candidate with separate output directories.

```sh
NOTICE_SOURCE_FROZEN=1 NOTICE_EXPECT=through node apps/cad-studio/test/notice-click-through-browser.mjs "$OUT/notice"
D563_SOURCE_FROZEN=1 node apps/cad-studio/test/body-clipboard-recovery-browser.mjs "$OUT/recovery"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test recovery project-recovery-warning viewport-recovery drawing-notice-lifecycle
pnpm exec eslint apps/cad-studio/{src/App.tsx,src/ui/StudioNoticeStack.tsx}
pnpm --dir apps/cad-studio build
git diff --check
```

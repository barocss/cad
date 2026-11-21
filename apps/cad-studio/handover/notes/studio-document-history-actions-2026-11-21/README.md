# D1510 — Separate Studio document history actions

P4, row 22. Base `4d2ab4e897975601a38ea5a240bcb299a7d6204a`.

Move Undo, Redo and their shared reverse/restore operations into `useDocumentHistoryActions`. App still owns work invalidation and the document-boundary effects. The stop action uses the same reverse/restore path as Undo and Redo. The central App goes from 3,734 to 3,712 lines.

## Verification

- **PASS, actual desktop Studio before and after.** Project Open, Undo, Redo, Undo and Save restore the correct file name, active document, dirty state and accepted geometry. Save writes A at 72 mm³. B stays byte-identical at 128 mm³.
- **PASS, actual clipboard and same-document history.** Across native Open Undo and Redo, old Paste requests refuse without changing the document or history. A fresh Copy in B allows both copies at the same 22 mm and 44 mm offsets. The independent geometry oracle passes.
- **PASS, exact receipt comparison.** Across four Studio runs, all 23 product checkpoints and one project-file observation match. The comparison includes docs, numeric bodies, selection, views recorded by the test, history and the project file hashes. The runs record no downloads.
- **PASS, affected checks.** All 17 targeted Studio tests, scoped lint, Studio types and production build. Git diff checks and browser source hashes pass.
- **NOT_RUN.** Desktop forced worker stop, native folder dialogs, mobile, alternate renderers and full local suites. The worker stop ownership test passes in the focused suite.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during actual Studio runs. Keep receipts and screenshots outside Git.

```sh
pnpm --dir apps/cad-studio test stop-work-ownership body-clipboard draft-selection-history
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/useDocumentHistoryActions.ts
pnpm --filter @barocss/cad-studio-app build
git diff --check
cd apps/cad-studio
D958_SOURCE_FROZEN=1 node test/project-open-save-history-browser.mjs "$EVIDENCE/project" --fixed
D556_SOURCE_FROZEN=1 node test/body-clipboard-history-browser.mjs "$EVIDENCE/clipboard" --expect=fixed
```

Run both flows on the base and candidate in separate output folders. Compare the `states`, `observations` and `downloads` arrays for each flow. During the candidate run, check the hashes of App and the extracted module before starting and after cleanup.

# D1506 — Separate Studio's edit-in-place session actions

P4, row 22. Base `73c8ad59eebc724a6d2409211a1c6bf798352c6f`.

Move the enter, finish, cancel and blocked-action handlers from App into the edit-in-place module. Route each document replacement and undo update through the existing App owners. The delayed discard callback still checks the active session before returning to the assembly. App is 3,734 lines, down from 3,769.

## Verification

- **PASS, actual desktop Studio before and after.** Both shared-definition runs edit the child width from 20 to 30 mm and retain both occurrence placements. Cmd+S while inside the part refuses. Finish updates both occurrences in one assembly step, Undo/Redo are exact, and Cancel discards the later 45 mm draft.
- **PASS, actual clipboard ownership.** Enter, Cancel and Finish isolate the child and assembly body clipboards. Each stale Paste refuses with the same document, history and selection. A fresh Copy permits Paste. The independent body oracles pass.
- **PASS, exact comparison.** The two baseline and two updated runs have the same 20 complete Studio checkpoints and two observations. The comparison includes accepted docs, body records, selection, notices, and history. The clipboard flow also compares undo and redo controls, document names and dirty state. The flows produce no download changes.
- **PASS, affected Studio checks.** 10 focused tests, scoped lint, type check and production build. Git diff checks pass.
- **FAIL, initial type check.** Two type-only imports used an incorrect package specifier. Corrected the imports before the final build and both updated Studio runs.
- **NOT_RUN.** Native file reopen after finishing the shared edit, other assembly families, alternate renderers, mobile and full suites.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during each browser flow. Keep snapshots and logs outside Git.

```sh
node apps/cad-studio/scripts/test.mjs edit-in-place body-clipboard workspace-mode-exit
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/editInPlaceActions.ts}
pnpm --filter @barocss/cad-studio-app build
git diff --check
cd apps/cad-studio
EDIT_IN_PLACE_SOURCE_FROZEN=1 node test/edit-in-place-browser.mjs "$EVIDENCE/shared"
D564_SOURCE_FROZEN=1 node test/body-clipboard-in-place-browser.mjs "$EVIDENCE/clipboard"
```

Run the two browser commands on the base and candidate in separate output directories. Compare receipt `states`, `observations` and `downloads` in order for each flow.

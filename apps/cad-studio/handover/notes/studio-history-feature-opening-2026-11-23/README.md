# D1775 — Extract Studio History feature opening

P4 Studio maintenance, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `49fba918b6bb1c686df8c24b421f30dec8d9758a`.

Move History feature navigation into the existing History editor session module. Preserve the current owner check before and after confirmation, the focus origin, the source review cancellation and the deferred command editor restart. App retains the document and the state changes it owns. App.tsx goes from 3,077 to 3,062 lines.

- **PASS, actual desktop Studio, ordinary History editor.** The History bar keeps its position and rejects clicks while a command or Sketch is active. With the Box editor open, enter a 64 mm draft in the 60 mm width field. Opening the same feature keeps the draft. Opening the Hole prompts. Keep editing restores focus to the input and retains 64 mm. Discard opens the Hole. Closing returns focus to its History step. Reopening the Box shows the authored 60 mm width. The document remains unchanged throughout.
- **PASS, actual desktop Studio, command and sheet routes.** At 1,024 and 1,440 pixel desktop widths, reopen Text Relief in its command editor through History. An out-of-bounds edit is refused and Cancel preserves the accepted model. From flat-pattern inspection, open each of the two correct Flange owners and the shared sheet rules. The owner link updates after same-key document Open and the dialog closes on New part.
- **PASS, before and after.** Thirteen captured states, five observations, four History readings and the Flange native inspector bytes match exactly. The six desktop runs have zero source, page or console errors.
- **PASS, affected checks.** 65 Studio tests, scoped ESLint, Studio production build with types, driver syntax and Git diff check.
- **FAIL.** None in the selected checks.
- **NOT_RUN.** Full local suites, alternate GPU backends, mobile and live providers. Issue #44 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run all three desktop commands on the base and candidate in separate output directories. Use the candidate History driver on the base.

```sh
HISTORY_SOURCE_FROZEN=1 HISTORY_EXPECT=dimmed node apps/cad-studio/test/history-bar-browser.mjs "$OUT/history" --feature-navigation
TEXT_RELIEF_CONTAINMENT_FROZEN=1 node apps/cad-studio/test/text-relief-containment-browser.mjs "$OUT/text"
CAD27_OWNER_FROZEN=1 node apps/cad-studio/test/flange-bend-owners-browser.mjs "$OUT/flange"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test history-feature-editor editor-return-focus flange-bend-owners shared-sheet-rules draft-selection-history
pnpm exec eslint apps/cad-studio/{src/App.tsx,src/state/useHistoryEditorSession.ts,test/history-bar-browser.mjs}
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/history-bar-browser.mjs
git diff --check
```

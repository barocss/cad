# D1667 — Extract the Studio History editor session

P4, row 22. [#44](https://github.com/barocss/cad/issues/44). Base `c5cc944342540b55b4c79322cc42e12c3c00fbb3`.

The History session owns the selected feature, the draft owner and the opening button. The editor builds Apply from the same live document and Worker owners that it uses for saved commands. App supplies the state and operations that those checks need. App is 3,392 lines, down from 3,412.

- **FAIL, base.** Open Extrude 10 with Enter in History, type 14 in Distance and press Enter on Close editor. Studio closed the editor but did not return focus to its History button. The direct feature entry did not record its opener.
- **PASS, desktop Studio WebGPU.** Close returned focus to Extrude 10, preserved the accepted document and Undo state, and showed Distance 10 mm on reopen. A blank Distance still blocked Apply. Restoring 10 mm and applying only Width 42 mm produced 12,600 mm³ with Undo and Redo. After opening Extrude 5 through the discard confirmation, Close returned focus to that second button. Cancel of a delayed held Fillet replacement retired the reply and preserved the part. Free-sketch Close and Extrude Cancel and Escape passed at desktop widths of 1,024 and 1,440 px.
- **PASS, before and after.** Four Linked Inset, six signed Offset and four held Fillet checkpoints retained the same document, bodies, selection, History, editor and notices. Native observations also matched. Across six final browser runs, 33 checkpoints passed with 632 to 1,173 frozen files per run and zero file changes, page errors or console errors.
- **PASS, affected checks.** 167 Studio tests, Studio type check and production build, scoped lint, driver syntax and Git diff check.
- **NOT_RUN.** Full local suites, WebGL2, mobile and assistive technology. #44 remains open for its wider scope.

Use Node 22.19.0, the heavy gate and installed Chrome and Playwright (`CHROME`, `PW_DIR`). Keep the worktree frozen during each desktop run and put output outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/{App.tsx,state/useHistoryEditorSession.ts,ui/FeatureHistoryBar.tsx,ui/HistoryFeatureEditor.tsx} apps/cad-studio/test/{history-feature-editor,flange-relief-dimensions-history-owner,flange-width-history-owner,partial-flange-radius-history-owner,partial-flange-radius-source-history-owner,sheet-relief-shape-history-owner}.test.ts apps/cad-studio/test/{empty-history-number,held-variable-fillet-replacement,node-editor-draft-exit}-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test history-feature-editor history-feature-apply history-owner editor-return-focus held-draft-face-replacement held-finish-replacement
pnpm --dir apps/cad-studio build
D1138_SOURCE_FROZEN=1 node apps/cad-studio/test/empty-history-number-browser.mjs "$OUT/number"
D1173_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-face-history-browser.mjs "$OUT/offset"
D1204_SOURCE_FROZEN=1 node apps/cad-studio/test/linked-inset-review-focus-browser.mjs "$OUT/inset"
HELD_VARIABLE_FILLET_FROZEN=1 node apps/cad-studio/test/held-variable-fillet-replacement-browser.mjs "$OUT/fillet" --close-editor-pending
D963_SOURCE_FROZEN=1 node apps/cad-studio/test/node-editor-draft-exit-browser.mjs "$OUT/draft-exit" --fixed
D1346_SOURCE_FROZEN=1 node apps/cad-studio/test/extrude-cancel-focus-browser.mjs "$OUT/extrude"
git diff --check
```

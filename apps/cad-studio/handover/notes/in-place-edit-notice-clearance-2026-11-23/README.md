# D1785 — Keep in-place edit notices clear of Details

P4 Studio usability, rows 15 and 20. [Issue #44](https://github.com/barocss/cad/issues/44). Base `81ec4766f27269ffccfad34f3e392f4dc98c6dac`.

Align the notice stack below the measured in-place edit status bar when the two would overlap. Reuse the existing CSS variable and ResizeObserver pattern. Remove the temporary offset when the session leaves. Date, notice contents, click-through behavior, document ownership and assembly actions use the existing paths.

- **FAIL, original interaction reproduced.** In the 1440 × 1000 desktop view, expanded Details ends at y = 177 px and the save-refusal notice starts at y = 144 px. The status bar receives the pointer at the center of the notice's Dismiss button. The helper timed out in the first D1784 baseline. The D1785 baseline confirms the 33 px overlap and original hit target directly.
- **PASS, fixed desktop Studio WebGPU.** The notice tracks the expanded status bar at y = 185 px, the collapsed bar at y = 157 px and the re-expanded bar after resizing to 1100 × 1000 at y = 199 px. All three readings retain an 8 px gap and make the Dismiss button the pointer target. Click Dismiss at 1100 px while Details stays open. The edited document and History labels match their pre-dismiss values. Finish, Undo, Redo, Keep editing, Discard, Save and fresh Open pass. The finished file matches D1784 byte-for-byte at SHA-256 `0f731697953acb1e477b8b02b15faa2ddf43f8132afcd04f98ef866baece6685`. When the edit status leaves, the stack returns to y = 144 px.
- **PASS, controls and affected checks.** The three click-through notice states match D1781. The nine recovery states match after normalizing the saved-at timestamp in two states, with four identical independent body records. The original, fixed and control Studio runs cover 31 checkpoints, with zero source changes, page errors or console errors. 60 Studio tests, scoped ESLint, Studio type check and production build, and Git diff check pass.
- **NOT_RUN.** Full local suites, unrelated overlay combinations, alternate viewport backends, mobile and live providers. First mechanical CAD remains 8/10 accepted. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. On base sources, pass `--expect-covered-notice` in place of `--dismiss-notice`.

```sh
EDIT_IN_PLACE_SOURCE_FROZEN=1 node apps/cad-studio/test/edit-in-place-browser.mjs "$OUT/fixed" --extracted-status --dismiss-notice
NOTICE_SOURCE_FROZEN=1 NOTICE_EXPECT=through node apps/cad-studio/test/notice-click-through-browser.mjs "$OUT/notice"
D563_SOURCE_FROZEN=1 node apps/cad-studio/test/body-clipboard-recovery-browser.mjs "$OUT/recovery"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test edit-in-place recovery project-recovery-warning viewport-recovery drawing-notice-lifecycle unapplied-save-notice
pnpm exec eslint apps/cad-studio/src/ui/InPlaceEditStatus.tsx apps/cad-studio/test/edit-in-place-browser.mjs
pnpm --dir apps/cad-studio build
git diff --check
```

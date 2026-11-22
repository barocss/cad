# D1676 — Extract Studio global keyboard routing

2026-11-22 · P4 row 22 · [#44](https://github.com/barocss/cad/issues/44) · Base `eb21f3a81db69ee624e19df851cbfb2a94e6aacd`

`useStudioKeyboard` owns the Window capture and bubble listeners, keyboard precedence, the body clipboard actions and arrow-key nudging. Both listeners use the same bindings that App refreshes during render. The capture listener still handles held Enter and Escape before the bubble listener can act. App supplies the current document, selection and workspace services. App still owns the document boundary and accepts or refuses model edits. The toolbar and keyboard still call the same History action. App is 3,304 lines, down from 3,392. The keyboard hook is 234 lines, including the typed bindings.

- **PASS, before and after in actual desktop Studio WebGPU.** Run seven existing workflows on each source revision. The run pairs match at 112 captured states and 66 additional observations. The checks include document bytes or values as recorded by each driver, body data, selection, History, notices and available actions. Each candidate run froze 633 to 1,173 files, including the new hook. Each pair differs only in App and the new hook. No source changed during any run, and no page or console errors were recorded.
- **PASS, input routing.** Native text Undo and Redo remain in the File name and command-search controls. Space activates a focused toolbar button and opens the palette from the workspace. Shortcut Help consumes Delete, Backspace and Undo while open. Closing Help restores workspace shortcuts. Escape closes the palette before cancelling Section face-pick and preserves selection. Held sketch-action Enter and Escape keep the draft. Active-outline Undo and Redo preserve the current document through Save and Open. Meta and Control Copy and Paste keep the text-input focus boundary. Body Paste after text input still uses the current selection and recorded offset.
- **PASS, affected checks.** 52 Studio tests, scoped lint, Studio production build with types and Git diff check.
- **FAIL, corrected during implementation.** Scoped lint found the old `withNode` import after moving nudge. The first type check found that the sketch input chain could return a draft object. The binding now provides the same boolean result that the previous key guard consumed. The final lint and build pass.
- **NOT_RUN.** Full local suites, WebGL2, assistive technology and dedicated coverage for every workspace and modal branch. #44 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate and installed Chrome and Playwright (`CHROME`, `PW_DIR`). Run on the base and candidate in sequence. Keep output outside Git. Compare each receipt's `states`, `observations`, `reads` and `downloads`.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/useStudioKeyboard.ts
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test palette command-apply-queue section-face-pick-escape circle-from-chord history-feature-editor
pnpm --dir apps/cad-studio build
D751_SOURCE_FROZEN=1 node apps/cad-studio/test/palette-text-history-browser.mjs "$OUT/palette-text-history"
D1397_SOURCE_FROZEN=1 node apps/cad-studio/test/section-face-pick-escape-browser.mjs "$OUT/section-face-pick-escape"
D1356_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-active-draft-history-browser.mjs "$OUT/sketch-active-draft-history"
D878_SOURCE_FROZEN=1 node apps/cad-studio/test/circle-from-chord-browser.mjs "$OUT/circle-from-chord"
D569_SOURCE_FROZEN=1 node apps/cad-studio/test/body-clipboard-text-focus-browser.mjs "$OUT/body-clipboard-text-focus"
D684_SOURCE_FROZEN=1 node apps/cad-studio/test/studio-shortcut-focus-browser.mjs "$OUT/shortcut-focus" --fixed
D703_SOURCE_FROZEN=1 node apps/cad-studio/test/studio-shortcut-focus-browser.mjs "$OUT/shortcut-modal" --modal-fixed
git diff --check
```

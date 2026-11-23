# D1857 — Extract the rounded inset History edit action from App

P4 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md), [#44](https://github.com/barocss/cad/issues/44). Base `f33080ea2dbad07523ea5bd2e3f3a8eede32ee3f`.

The rounded inset command module now prepares the existing History edits. It takes the active document and History index from App. It checks the displayed source, applies a distance or width edit, or detaches the same feature. App retains work ownership and receives the candidate through the existing evaluation path. App.tsx falls from 2,875 to 2,847 lines.

- **PASS, actual desktop Studio.** Three source-frozen workflows passed across 30 recorded states. A held width reply released after the user confirmed Discard changes did not affect the replacement document. The original distance edit retains its dimensions and native topology through failure, Undo, Redo and fresh Open. Detach keeps the ordinary sketch and native body. The source-width workflow refuses a closed opening and a source below its R2 corner span, preserves the last accepted part and recovers with a valid width. The files reopen with the expected native results.
- **PASS, affected checks.** 11 Studio focused tests, Studio types, Studio production build, scoped ESLint and Git diff check.
- **FAIL.** The first desktop distance run timed out at document replacement because the driver did not confirm Discard changes. The corrected driver completed that route and all checks passed.
- **NOT_RUN.** Full local suites, other renderers, mobile and live providers. #44 remains at 211/220. First mechanical CAD remains 8/10 and whole-product completion remains unmeasured.

```sh
pnpm --dir apps/cad-studio test history-feature-apply linked-inset command-build-failure
pnpm --dir apps/cad-studio build
D913_SOURCE_FROZEN=1 node apps/cad-studio/test/rounded-sketch-offset-browser.mjs "$OUT/edit-final" --edit-inset
D914_SOURCE_FROZEN=1 node apps/cad-studio/test/rounded-sketch-offset-browser.mjs "$OUT/detach" --detach-inset
D917_SOURCE_FROZEN=1 node apps/cad-studio/test/rounded-sketch-offset-browser.mjs "$OUT/width" --width-inset --source-span-guidance
git diff --check
```

# D1905 — Extract History dimension-handle lifecycle from App

P4 [row 15](../../roadmap-rows/15.md) and [row 21](../../roadmap-rows/21.md), [#44](https://github.com/barocss/cad/issues/44). Base `be93c42cef0b34371a8589881096bbc2b472551c`.

Move History Split/Fillet evidence reads, stale handle retirement, drag settlement and drag transforms into `useStudioHistoryHandles`. App passes its document, view and editor authority. The independent source checks remain. The existing viewport priority, drag preview and commit paths retain the same handlers. App decreases from 2,556 to 2,532 lines.

- **PASS, actual desktop Studio before and after.** One Split and seven circular Fillet states in each run. All eight saved snapshots match on document, body result, history and selection. The four native Fillet readings have the same radius, volume, face names and digest.
- **PASS, Split.** The At handle uses the original rectangular stock centre with a downstream Hole present. An unsaved typed At value blocks the drag. Reset permits Apply, Undo and Redo. The unchanged Hole leaves total native volume at `12000 − 16π` mm³. New retires the prior handle.
- **PASS, circular Fillet.** The original two-rim Fillet handles cancel and edit from an end-on view. Radius 0.6→1.5 mm changes the native volume from 500.74568094072845 to 491.02762723977276 mm³. The typed route gives the same two native toroidal faces, and native Save and fresh Open retain the result.
- **PASS, affected checks.** 35 focused Studio tests, focused lint, Studio type check and production build, and Git diff check. Initial lint caught one unused App import. The first build also exposed a local name collision and the need to type the shared inputs with the existing Fillet and Split contracts. The corrected source passes all final checks.
- **NOT_RUN.** Whole local suites, unrelated viewport tools, mobile and live providers. #44 remains open. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
pnpm --dir apps/cad-studio test history-fillet-radius-receipt split-source-receipt gizmo
pnpm --dir apps/cad-studio build
SPLIT_SOURCE_FROZEN=1 node apps/cad-studio/test/split-history-source-handle-browser.mjs "$OUT/split"
D1715_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-circular-history-fillet-browser.mjs "$OUT/fillet"
git diff --check
```

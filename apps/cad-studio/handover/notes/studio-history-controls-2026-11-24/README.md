# D1840 — Extract Studio history controls from App

P4, rows [16](../../roadmap-rows/16.md) and [20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `3a189f4ab88023f0766676771efef7b761b6a292`.

The top bar and keyboard use the same history control object. It chooses the current draft or document path and calculates button text and enabled state. App retains the document transition, draft cleanup and restored Sketch framing callbacks. App.tsx reduces from 2916 to 2896 lines.

- **PASS, document history.** Undo a Project Open back to the edited A part, redo B, then return to A. The filename, active Save target, native volume and dirty state agree. Save writes the changed A and preserves the earlier B bytes.
- **PASS, 2D Sketch.** At 1024 and 1440 desktop widths, keyboard and toolbar Undo/Redo preserve the active draft through Extend, construction Trim and inward Offset. Finish, native Undo/Redo and fresh Open retain the respective 2700, 2475 and 1992 mm³ solids.
- **PASS, Cage and 3D Sketch.** The top bar shows the mode-specific action labels. Cage Undo/Redo restores the committed Inset draft while the accepted document remains the original box. Finish and native Open preserve the later extruded cage. In 3D Sketch, the top bar restores draft Length 40 and 45 mm while the accepted document stays at 40 mm. Cancel ends the draft.
- **PASS, affected checks.** 30 focused Studio tests, scoped ESLint, Studio types and production build, and Git diff check. Four desktop runs give 34 checkpoints, with zero console, page or frozen source errors.
- **FAIL.** None observed.
- **NOT_RUN.** Mobile, other GPU backends and full local suites. #44 remains open for separate checklist items. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
D958_SOURCE_FROZEN=1 node apps/cad-studio/test/project-open-save-history-browser.mjs "$OUT/project" --fixed
D1356_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-active-draft-history-browser.mjs "$OUT/sketch"
CAGE_INSET_SOURCE_FROZEN=1 node apps/cad-studio/test/cage-inset-browser.mjs "$OUT/cage" --topbar-history
D1140_SOURCE_FROZEN=1 node apps/cad-studio/test/skeleton-number-browser.mjs "$OUT/skeleton" --topbar-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test draft-selection-history proposal-history-focus work-ownership history-feature-apply
pnpm exec eslint apps/cad-studio/src/{App.tsx,state/studioHistoryControls.ts} apps/cad-studio/test/{cage-inset,skeleton-number}-browser.mjs
pnpm --dir apps/cad-studio build
git diff --check
```

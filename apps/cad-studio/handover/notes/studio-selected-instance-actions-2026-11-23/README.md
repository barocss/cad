# D1760 — Extract the selected placed part actions from Studio App

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `b59515fd4e44460dbf20d7f671ec840951fa86dc`.

Move the selected placed part Move, Rotate, Duplicate and Fix actions into the assembly module. The controller uses the same model edits, change check, document commit, selection update and refusals. App still supplies the active document, selected occurrences and editing context. App.tsx goes from 3,121 to 3,100 lines.

- **PASS, desktop Studio WebGPU before and after.** Eight runs match 17 paired Studio states, three independent observations and 10 native file or inspector records byte for byte. Move two parts by (12, −7, 5) mm. Rotate two parts by 90° around one world pivot. Duplicate two parts by (80, 0, 5) mm and check new selections and BOM quantities. Fix and Unfix the selected group and reopen a saved fixed group. Preserve other parts, model geometry and the expected History changes.
- **PASS, refusal and draft ownership.** The Move, Rotate and Duplicate actions refuse a fixed part and keep the source document. Fix refuses the selected mated group. Draft values reset for the tested selection changes and Escape. Existing Undo, Redo, Save and fresh Open checks match. All desktop runs have zero source, page or console errors.
- **PASS, affected checks.** 21 Studio tests, scoped lint, Studio types and production build, and Git diff check.
- **FAIL.** None.
- **NOT_RUN.** Full local suites, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external evidence directories for the base and candidate.

```sh
ASSEMBLY_TRANSLATE_SELECTION_FROZEN=1 node apps/cad-studio/test/assembly-translate-selection-browser.mjs "$OUT/move"
ASSEMBLY_ROTATE_SELECTION_FROZEN=1 node apps/cad-studio/test/assembly-rotate-selection-browser.mjs "$OUT/rotate"
ASSEMBLY_DUPLICATE_SELECTION_FROZEN=1 node apps/cad-studio/test/assembly-duplicate-selection-browser.mjs "$OUT/duplicate"
ASSEMBLY_GROUND_SELECTION_FROZEN=1 node apps/cad-studio/test/assembly-ground-selection-browser.mjs "$OUT/fix"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test assembly-translate-selection assembly-rotate-selection assembly-duplicate-selection assembly-ground-selection
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/assembly/selectedInstanceActions.ts
pnpm --dir apps/cad-studio build
git diff --check
```

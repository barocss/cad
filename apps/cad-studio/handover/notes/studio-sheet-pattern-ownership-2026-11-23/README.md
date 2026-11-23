# D1793 — Extract Studio sheet pattern ownership from App

P4 Studio code structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `8ab47cf10833b005932ddc0c245c615385470564`.

Move the flat-pattern view, shared-rule and Flange History actions, and bend-table request validation into `useStudioSheetPatterns`. App still supplies the current document ownership, History transition, evaluation and commit actions. The same dialog, labels, controls and edit sequence apply. App.tsx goes from 3,036 to 2,980 lines.

- **PASS, paired desktop Studio WebGPU.** The shared U-profile rule change R2 → R3, Undo, Redo, Save and fresh Open match before and after. A held same-key Open leaves the old History action unavailable and replaces the dialog only with its own file. The saved U-profile file is byte-identical.
- **PASS, bend-table control.** Duplicate a sheet, edit the copy, and load a valid table on the copy. The original keeps its own allowance. The missing-row refusal preserves the copy, and both flats reopen with the same inputs and geometry. The two before/after flows match all 20 recorded Studio states and 15 native observations exactly.
- **PASS, Flange owner control.** The desktop dialog opens the exact n3/n4 Flange and sheet-rule owners. A same-key replacement retires the old dialog and shows separate labels for an own radius and an inherited radius. Five qualified Studio runs record 42 snapshots with unchanged source capsules and zero page or console errors.
- **PASS, affected checks.** 59 Studio tests, changed-file ESLint, Studio type check and production build, and Git diff check.
- **NOT_RUN.** Full local suites, other viewport backends, mobile and broader manufacturing qualification. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. Run the first two flows on both source versions. The offline browser context serves empty CSS for the external font request and uses local Studio.

```sh
SHARED_SHEET_RULES_SOURCE_FROZEN=1 node apps/cad-studio/test/shared-sheet-rules-browser.mjs "$OUT/shared"
D820_SOURCE_FROZEN=1 node apps/cad-studio/test/sheet-move-browser.mjs "$OUT/copy-table" --copy-table
CAD27_OWNER_FROZEN=1 node apps/cad-studio/test/flange-bend-owners-browser.mjs "$OUT/flange-owners"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test shared-sheet-rules flange-bend-owners flat-pattern-path history-feature-editor
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/useStudioSheetPatterns.ts
pnpm --dir apps/cad-studio build
git diff --check
```

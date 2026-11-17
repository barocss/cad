# Section letter ownership (#646)

Actual baseline on `1e614a872`: remove section B (front, 16, removed form), then Add section. The new top cut reuses B while child detail C still refers to `section:B`. The baseline screenshot shows C rendered against that unrelated cut. A continuation-sheet assignment also remains. This is a demonstrated reference ownership defect, not a proposed topology improvement.

The new `reservedSectionLetters` covers retained dimension, standalone control, child detail and sheet references. Studio allocates from whole-drawing reservations; its fixed A checkbox cannot recreate a held A. Sheet merge renames newly introduced reserved section letters and moves only newly authored child references, not existing held details. The strict drawing API rejects new cuts claiming reserved letters. Existing cut edits and explicit removal remain supported; Undo restores the original document rather than reinterpreting stale references. No original annotations or sheet entries are silently deleted.

## Verification

- Focused baseline fails. Ownership and existing detail tests: **8/8 PASS**. Section/detail/manufacturing regression batch: **63/63 PASS**.
- Model and Studio TypeScript **PASS**. Scoped lint on changed model helpers, SheetSettings and new tests **PASS**; `git diff --check` **PASS**. Existing DrawingWorkspace unused-binding lint exceptions and prior drawing PDF golden limitation remain separate.
- Browser baseline **FAIL** as expected. Fixed01 reaches deletion/Add history and edit but asks for SVG after moving the top cut to +5 (Z=-5, outside the part). Fixed02 waits for valid geometry at that same invalid position and times out. These are test errors, not an export defect. Fixed03 uses the valid -5 cut, but its DOM selector wrongly assumes section groups use `data-view`; actual sections use `data-dim`. All failed attempts remain recorded.
- Corrected fixed04 **PASS** with unchanged source capsule through cleanup. New D skips B/C. Original child and sheet rows stay identical. Two Undo/Redo pairs restore deletion and original B, normal D location editing works, actual SVG and native Save/fresh Open preserve D and unresolved C. Separate fixed-A flow proves remove → disabled recreation → Undo restored A.
- Independent XML inspection of both downloaded SVGs: two section D groups (cut and callout), no `detail:C` group. The final screenshot visibly retains the missing B sheet/detail warnings instead of falsely rendering C against D. Baseline and reopened screenshots visually inspected.
- Read-only review found no blocking reference loss/policy regression. Same-request API reference removal/reuse remains conservatively two-step, matching detail reservation policy. The fixed-A tooltip mentions Undo even when A is live on another sheet; its fail-closed behavior is intentional, no automatic cross-sheet reinterpretation.

Latest main `8581c919b` was fast-forwarded before integration (unrelated shaft editor work). No source ownership overlap. No PDF/DXF, general geometry, manufacturing certification or HOLD scope change.

Reproduce (Node 22, repository root):

```
node packages/barocss-cad-model/scripts/test.mjs drawing-section-ownership drawing-detail-ownership
node packages/barocss-cad-model/scripts/test.mjs drawing-section- drawing-detail.test drawing-manufacturing
node node_modules/typescript/bin/tsc --noEmit -p packages/barocss-cad-model/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
SECTION_LETTER_REUSE_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/section-letter-reuse-browser.mjs <fresh output>
```

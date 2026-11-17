# Manual datum target labels across sheets

Bounded #180 follow-up to 7505458ddb3dc001fb2cb531057f66944f9919a6. No schema migration or automatic relabeling.

Actual baseline: Front area A1 and Right area A2 had distinct IDs, but manually applying number 1 to the second target accepted a duplicate A1 across sheets. Fixed: validate the merged drawing before committing changed target rows. A conflicting manual edit refuses without any document mutation; untouched legacy/unresolved peers remain preserved. Existing local validation and strict authoring checks still apply. The global 200-row bound also applies.

Actual Chrome fixed run passed on its first attempt: duplicate A1 refused; valid A3 change; original target and part nodes exact; Undo/Redo; native Save/fresh Open. Downloaded SVGs independently parsed as XML: Front A1, Side A3 and reopened Side A3. Both baseline and fixed sources remained frozen through cleanup; screenshots visually inspected.

Command (Node 22.19.0, repository root; set PW_DIR and CHROME to installed Playwright/Chrome):

```sh
DRAWING_TARGET_LABEL_SHEETS_FROZEN=1 node apps/cad-studio/test/drawing-target-label-sheets-browser.mjs <fresh-output-directory>
node apps/cad-studio/scripts/test.mjs drawing-target-allocation
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
node node_modules/eslint/bin/eslint.js apps/cad-studio/src/ui/DrawingWorkspace.tsx apps/cad-studio/test/drawing-target-label-sheets-browser.mjs
```

Studio type check PASS. Related allocation tests 3/3 PASS. Workspace lint retains the same pre-existing unused DrawingFix, _leader, _sheet errors; browser driver adds none. Prior drawing-sheets PDF golden mismatch is not rerun or claimed repaired. This flow exercises area targets and label editing, not all point/line editing variants, standards certification, PDF/DXF, or manufacturing. Existing HOLDs and #180 remain open.

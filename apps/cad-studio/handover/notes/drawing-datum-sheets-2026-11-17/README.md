# Face datum identity across drawing sheets

Base `80fb31f1b`. Actual browser baseline reproduced **accepted duplicate identity**, not refusal: Sheet 1 Add face datum creates datum-A/A in top view, then Side detail creates another datum-A/A in right view. Both remain saved and the right sheet paints A. The existing reader deliberately retains duplicates for diagnosis; it is unchanged.

Studio now allocates face datum IDs/letters against all datum features in the whole drawing, not the active sheet subset. Arbitrary imported IDs and unresolved references remain reserved. Allowed letters (excluding I/O/Q), 200-row bound, face anchor selection and sheet-local remove/clear stay unchanged. No schema change or migration of existing duplicates.

## Verification

- Baseline browser FAIL at expected B vs actual A, with duplicate datum-A records. No original datum loss observed or claimed.
- First fixed browser PASS: A/B unique IDs; original A face/near/place and model nodes unchanged; single Undo/Redo; second-sheet Clear leaves A and Undo restores B; actual SVG download contains B; native Save/fresh Open preserves both and each sheet lists only its own datum.
- Exported SVG independently parsed as XML; exact B text present. Both screenshots visually reviewed. Source frozen through browser cleanup, no changes in either run.
- Allocation tests 3/3 PASS: cross-sheet merge/strict authored validation, arbitrary ID collisions, unresolved reservation, letter exhaustion and 200 rows.
- Studio tsc PASS. Component/helper/test ESLint PASS. DrawingWorkspace targeted lint has 3 **pre-existing** errors, confirmed by piping unchanged HEAD through ESLint: unused DrawingFix (line 42), _leader and _sheet (line 754). The only Workspace change is the allDatums prop.
- Existing model drawing-sheets baseline **26/27**, repeated before product edits: plain one-page PDF golden expected d280596ee08f569553b20d08e72673421cb58fed919f1e0917128369a1dcd081, actual 533e64765f48aeac1d244bc20b3aad7551feb08349b8d06ab1a69b619d5e4b66. Cross-sheet datum diagnosis/preservation pass. Unrelated PDF golden not changed or claimed fixed.

Reproduce from root, Node 22:

```
node apps/cad-studio/scripts/test.mjs drawing-datum-allocation
node packages/barocss-cad-model/scripts/test.mjs drawing-sheets
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
DRAWING_DATUM_SHEETS_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/drawing-datum-sheets-browser.mjs <fresh output>
```

Synthetic rectangular plate, native face n1.side0, top/right annotations only. No new GD&T solver, geometric tolerance certification, PDF qualification or manufacturing claim. Existing HOLDs and #180 remain open.

# Standalone frame identity across drawing sheets

Bounded #180 follow-up, separate from completed #106 placement guidance. Baseline main 41ad83c5a46df18db5b818e76d9bd8952d2ea48d.

Actual baseline: placing a Front frame created frame-1. Placing a Right frame on the second sheet completed the action but the document still had only the first frame. The local allocator reused frame-1; canonical readFrames discarded the duplicate. This was an authored annotation loss, not only an error message.

Fix: reserve IDs and the 200-frame limit across the whole drawing, including dimension-attached frames. Validate merged frame candidates against all existing frames before committing. Existing reader/legacy rule policy, geometry, placement, units, local deletion confirmation and moving identities remain unchanged.

Verification:
- New focused allocation/merge tests 3/3, existing model drawing-controls 9/9 PASS.
- Actual browser final PASS: both frames survive, first frame and nodes unchanged, Undo/Redo, native Save/fresh Open, local removal after confirmation keeps the first frame, Undo restores both.
- Real downloaded Front/Side/reopened Side SVGs independently XML-parsed: frame-1 / frame-2 / frame-2, each with Ø0.1.
- Baseline, first fixed and final fixed source capsules remained frozen through cleanup. Baseline and final screenshots visually reviewed.
- First fixed run passed creation/history, then stopped because the test expected 0.1 without the existing position-frame Ø prefix. Only the fixture expectation changed; final run passed. Initial type check found the test factory's union too broad; narrowed it to standalone-frame subtype, product unchanged.
- Final Studio type check PASS. New helper/test/driver lint PASS. Workspace retains the same three existing unused bindings (DrawingFix, _leader, _sheet). Prior drawing-sheets PDF golden mismatch is separate, not rerun or fixed.

Reproduction (Node 22.19.0, repository root, PW_DIR and CHROME point to installed dependencies):

```sh
DRAWING_FRAME_SHEETS_FROZEN=1 node apps/cad-studio/test/drawing-frame-sheets-browser.mjs <fresh-output-directory>
node apps/cad-studio/scripts/test.mjs drawing-frame-allocation
node packages/barocss-cad-model/scripts/test.mjs drawing-controls
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
```

Limits: synthetic plate Front/Right standalone frames; no general GD&T solver/standards certification, composite/stacked frame browser campaign, PDF/DXF or manufacturing qualification. No repair or migration of already lost annotations. #180 and existing HOLDs remain open.

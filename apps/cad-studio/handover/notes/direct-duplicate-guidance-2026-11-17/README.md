# Direct Duplicate relationship guidance (#29)

## Small UI change, existing behavior

Before acting, Duplicate now explains: “Creates independent copies in the same position and selects them. Moving a copy or editing its control points does not update the original.” The visible paragraph is associated with the button by `aria-describedby`. The wording refers to moving **a copy**, not an operation that deliberately selects both original and copy.

Only this paragraph and accessibility association changed in product code. There is no new linked-copy/deep-copy mechanism, schema or geometry behavior. Existing Duplicate assigns a new object ID/name while initially reusing immutable geometry; subsequent editing changes only the selected object. Internal storage details are not presented as user-facing linkage.

## Real baseline and acceptance

- `/tmp/cad-direct-duplicate-before-01`: baseline diagnostic PASS. The actual button had no `aria-describedby` or adjacent relationship explanation; `before-01-no-guidance.png` records the unchanged-document scene. It is not a pre-fix product acceptance pass.
- `/tmp/cad-direct-duplicate-after-01`: first post-fix actual PASS, no failed attempts. `after-01-guidance.png` shows the complete explanation before Duplicate. Both images were directly inspected, readable and free of personal information.
- Public Duplicate adds one distinct object and selects it. Independent Python parsing proves both source control-point sets initially `[[0,0,0],[12,6,0]]` (same position).
- Editing only copy P1 X to18 leaves the original object and source exact. Parsing proves original `[12,6,0]` versus copy `[18,6,0]`.
- Editing only original P1 Y to9 leaves the copy object/source exact. Parsing proves original `[12,9,0]` versus copy `[18,6,0]`.
- Three Undo and three Redo restore each exact expected document. Native Save original Blob bytes are preserved in `saved.bcad`; fresh Open is deep-equal to the final document. The independent parser verifies both point sets again after Open.
- Full receipts remain at the run paths; `qualification.json` preserves a minimal result extract and artifact hashes. Four independent oracle results are included.
- Source capsule523→523, changes/errors/console errors empty, two contexts/browser/server cleaned up before freeze release.

## Scope

Actual acceptance uses one synthetic two-point degree1 curve. No native evaluator rerun was needed. Move, multiple simultaneously selected copies, trimmed surfaces, broader shape types and any future linked-copy workflow were NOT RUN. The focused metadata test uses a regular curve only; no trim-support claim is made. No protected At-t/Split, shared GPU, kernel or HOLD work was changed. This note does not claim closure of all #29 requirements.

## Checks

Driver syntax and changed-file lint PASS. Product Studio build4.19s PASS. Final focused **10/10 PASS** (new2+adjacent8) and Studio TypeScript PASS, session45763 exit0. Logs: `/tmp/cad-duplicate-final-focused.log`, `/tmp/cad-duplicate-final-tsc.log`, `/tmp/cad-duplicate-build.log`. The final test-only fixture clarification did not change the browser-tested product.

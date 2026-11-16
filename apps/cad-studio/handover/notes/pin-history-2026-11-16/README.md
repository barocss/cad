# Dowel pin History and #28 completion reconciliation

## Remaining History gap

The original #28 reproduction explicitly included changing Dowel pin in History. The pin had no editable fields even after its creation guidance was corrected. Baseline focused tests failed on both missing fields.

History now exposes diameter and length using the creation labels. Exactly zero removes the optional override; negative or non-finite values are not silently changed to defaults. Shaft, cross-hole, fit flag, node ID and outputs remain unchanged. Cross-hole reassignment is outside this change.

Verification: focused native tests 3/3 cover optional/default/explicit/reset values, independent cylinder volumes, fit/reference preservation and invalid dimensions. Actual frozen-source Chrome verifies length 20 → 24, Undo/Redo, oversized diameter refusal retaining the accepted document, zero restoring the original default document, and reopen. No browser errors or downloads; History/refusal screenshot reviewed. Model and Studio TypeScript, targeted lint and production build are checked separately. An initial test fixture narrowing error was corrected; production code did not change for that correction.

## Original acceptance criteria

| Original requirement | Resolution evidence |
| --- | --- |
| Actual placement, connection type and change scope can be identified | Frame anchor and section row History (`c8e71f233`, `10a9aa51b`); picked-edge Frame handoff (`a591a90db`); connector exact-face placement and owned opening/keep-out edit (`2542a503a`). |
| Errors identify the member or collision space | Butt gap reports point/member indices and conditional Cope recovery (`d6c06c6f9`); named keep-out status belongs to current geometry (`a93342f6d`); altered connector keep-out refuses overwrite (`2542a503a`); selected pin reports its flat-end limitation (`9fbb969c8`). |
| History editing and Undo verified | Frame anchor/section rows, connector placement and keep-out atomic change, and this pin dimension edit have targeted native and actual Chrome evidence. Existing shaft History dimensions remain unchanged. |

The three explicitly listed failures (1436 Butt guidance, 1439 Shift-pick interception, 1441 anchor/section row replacement) are resolved. The additional reproduced keep-out freshness, pin description and connector/pin History gaps are also resolved. This is a bounded closeout of the issue's stated criteria, not a claim that every historical checklist row was rerun or that CAD is manufacturing-qualified.

Nonterminal connector edits, row/face retargeting, modified keep-out ownership adoption, general fit-table editing and surface-trimmed pin generation remain outside this closeout. Existing WIP and HOLD scopes are preserved.

# Named copied surfaces in Sew refusals and History (#24)

The original 0.02 mm gapped-dome fixture reproduced the remaining #24 feedback problem: the visible refusal listed surface positions only, and History did not expose the persisted copy order. Its baseline actual Chrome receipt is /tmp/cad-sew-names-baseline.

Model evaluation now enriches only an owned native Sew unmatched-edge failure with the saved surface ordinal and name. The native code/category, feature, exact message/detail, unique active Sew owner, source count and reported indices must agree. Raw diagnostics, geometry and tolerance are unchanged. Duplicate labels retain their distinct ordinal. Ambiguous/nested/instance or malformed ownership retains the original refusal.

History exposes a read-only Copied sources list in persisted order through a small SewSourceList component; it does not read the current Direct selection or create a live reference. A new Sew preview no longer invents an accepted History failure row for its future n0, while accepted Sew History continues to identify the failed step. No useCommandPreview or original #126 WIP changes.

## Verification

- Model focused8/8 (Sew3 plus existing Hole5) and Studio7/7 PASS; includes raw error preservation, invalid owner/name-index cases, duplicate labels, safe text and new-vs-accepted History attribution.
- Model/Studio TypeScript and affected lint PASS. Final Studio production build4.12s PASS.
- Final source-frozen actual Chrome PASS for both dome-first and dome-last source order. At0.019, the same dome/front/back/left/right names appear with the appropriate positions (1,3,4,5,6 vs2,3,4,5,6); floor is not implicated. Preview has no future failed-History row. History lists all saved copies in order and preserves its accepted source on refusal.
- Both runs recover through automatic0 and explicit0.021, apply one strict-valid six-face/12-edge/eight-vertex solid, check independent volume1200 mm³, support gap0.02 mm and roof13.02 mm, edit History, Undo/Redo and reopen with the same copy order. No downloads/runtime errors. Refusal and expanded History screenshots visually reviewed.
- Receipts: /tmp/cad-sew-names-first01 and /tmp/cad-sew-names-last01. The fixture bytes retain the existing fa52cc2f0413a6440606be2ca7ffc2862ce691c348f434bccc606870c908aeac hash.

This resolves the named-boundary/copy-order requirement in comment6880187890. #24 is not yet closed: its Shell limit/label and wider STEP acceptance need their own scope comparison. No external STEP reader, viewport edge highlighting, full suite or CI claim; no native Shell/Sew widening or HOLD change.

# #701 Embedded design history in shared copies

Baseline 21a1040aa1dbe3e7d7ec13636aa92c67ecbf7e58. The real Save a copy without it button removed root design history but retained 12 synthetic history/prompt/plan markers in nested/shared parts and pending revisions. Only SYNTHETIC_PRIVATE test strings were used, never real conversations or personal data.

stripHistory now recursively cleans instances[].doc and pendingParts[].doc with a WeakMap, preserving document aliases and defensive cycles without touching the working document. Only history and proposal prompt/plan fields are removed. Geometry, placement, pending revision identity, proposal ops/summary and unrelated metadata are preserved. This is not full anonymization. Cyclic values are tested only as a defensive in-memory boundary, not as supported native files.

## Validation
- baseline01 source-preparation fixture bracket error: browser NOT_RUN. Corrected frozen baseline02: actual shared download contains 12 nested markers, expected FAIL.
- Fixed frozen Chrome: PASS, actual download contains zero markers, original unchanged, normal Save retains synthetic nested history, shared copy fresh Open renders original geometry/placements. Screenshots inspected.
- No source changes during the runs; contexts/browser/server cleanup complete.
- share-history-tree + proposals: 16/16 PASS; owned ESLint, Model and Studio tsc PASS.
- Disk before/after fixed stages: 11→12→13→13 GiB. No cache or user files deleted.

Run test/share-history-tree-browser.mjs with SHARE_HISTORY_TREE_FROZEN=1. The JSON evidence is the decoded actual download, containing synthetic data only.

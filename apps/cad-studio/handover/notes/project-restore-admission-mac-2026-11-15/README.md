# D1340 — Native admission before project restoration (#100)

## Implementation

Autosave and named-version Restore now await the existing native File Open admission before returning a document for adoption. The dedicated callback validates only; it does not repair or rewrite saved snapshots. A refused autosave keeps its offer. Errors name the file and, for versions, its user-visible version name, followed by the native cause. Saved files, recovery copies, logs and snapshots are not written by validation.

A restore request token plus the current App document/Open scope, project session, store/path and offered-copy or log identity rejects late results and late errors after edits, another Open, project close, a newer Restore or Discard. Named Restore callers now await the result. Existing normal restore remains a dirty, undoable edit.

## Verification

- Hook/native regressions107/107 PASS; final focused12/12 PASS. Actual native Offset rejects, preserves stored bytes/retry, returns valid recovery, and suppresses both stale source kinds across edit/Open/close/new Restore/Discard boundaries.
- Studio tsc, targeted useProject/VersionsPanel/test lint, diff check and production build PASS. Full App lint retains the existing unrelated unused `_k`; it is not claimed clean.
- Source-frozen actual Chrome/WebGPU1024/1440, isolated OPFS projects: a20×10×12mm/15° tapered part authored through real Offset commands+3/+2 has volume1547.1972078307306mm³. A stored test copy changing the first distance to+5 is refused by autosave and named Restore before adoption. Accepted document/Undo/Redo remain unchanged; all5 stored file/log/snapshot/recovery byte arrays remain identical.
- Valid named Restore to+2/+2 produces1534.256293850997mm³ as an unsaved edit, Undo/Redo both work, stored data remains unchanged. Separate valid autosave Restore succeeds. Independent tapered-volume polynomial checks both volumes.
- Actual1024 refusal and valid named-restore screenshots reviewed: named file/native collapse cause, retained offer, then dirty restored geometry. Final receipt SHA256 `387983f00cdf881ef15f01b24ec7eef8257ccffb56a4edadd64bfe70467021a0`.

## Limits and first failure

First browser fixture construction omitted required stored face signatures and failed native admission before any browser action. The driver now authors the two offsets through the real command builder to capture signatures, then changes only the stored test copy. Final run PASS. Isolated snapshot injection does not claim ordinary editing produces these invalid files. Stale timing is controlled-hook evidence, not a forced browser-worker scheduling run. Assistive technology, new nested-part matrix, full suite and CI are not claimed. Existing HOLD remains. Branch and merge pre-write validation are separate #101/#102; next #101.

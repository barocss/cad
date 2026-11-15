# D1341 — Native admission before branch switching (#101)

## Implementation

Branch switching preserves the existing unsaved-work refusal, then validates the target through the same native admission used by Open/Restore before writing its log. A failure names branch/file/native cause and leaves branch, log, accepted document and stored snapshots untouched. The shared restoration request token and App/project/log identity discard stale validation results. A newer branch also supersedes pending Restore; late write receipts cannot return a replacement document.

## Verification

-54/54 PASS:13new branch/native tests,12restore and29existing version ownership. Valid/invalid pending geometry across edits/Open/close/Restore/new branch cannot write/adopt/notify; valid switching, explicit discard and BRANCH_UNSAVED remain supported.
- Studio tsc, target lint, diff check and production build PASS.
- Source-frozen Chrome/WebGPU1024/1440: native-command-authored20×10×12mm15° taper with Offset+3/+2 remains1547.1972078307306mm³ after refusing the stored first+5 target. Branch remains main, Undo/Redo unchanged and all stored bytes identical. Reload and Project Open retain main.
- Valid target+2/+2 switches to valid-offset at1534.256293850997mm³ and changes only the version log. Undo followed by main switch is refused as unsaved work, with log/document preserved. Redo restores the versioned target, then switching to main succeeds. Independent tapered-volume polynomial checks both valid volumes.
- Actual1024 refused/valid branch screenshots reviewed. Receipt SHA256 `cc09355c4b94fed9929106fdd0a0bbc1836e941295ad95c4f930bdf5b5a32cac`.

## Limits

Version functions and container encoding construct isolated stored invalid fixtures; ordinary editing is not claimed to create them. The first unit-test fixture attempted current-branch-only versionsOf to locate a different branch ID; corrected to the full log list before PASS. Browser first run PASS. Stale validation is hook evidence. Already-started storage writes retain existing keepLog custody/tag semantics; this does not introduce rollback or a cross-window transaction system. No assistive technology, full suite or CI claim. Existing HOLD unchanged. Merge admission remains next #102.

# D1342 — Native admission before merge persistence (#102)

## Implementation

After structural merge/conflict resolution, validate the candidate with existing native admission before keepLog writes any snapshot or head. Conflict-only results still return without writes. A geometry refusal names source/current branch, file and failing Offset feature (n3 in this case), with source-geometry/conflict-choice recovery. Non-geometry errors retain their existing guidance, including BRANCH_UNSAVED. The same current request/App/project/log boundary as Restore/branch switching prevents late validation from writing or adopting. No kernel or merge-selection rules changed.

## Verification

-86/86 tests PASS including16new merge/native tests: individually valid branches producing invalid combined geometry, valid merge, conflict with invalid and valid resolutions, unsaved work, stale valid/invalid candidates after edit/Open/close/new merge/Restore/branch. Existing document-file/Restore/branch/version tests retained.
- Studio tsc, target lint, diff check and production build PASS.
- Source-frozen Chrome/WebGPU1024/1440: real command-authored tapered20×10×12mm15° common Offset+2/+2, independently valid main+4/+2 and other+2/+4. Merging+4/+4 refuses atn3 before changes to document, Undo/Redo, log/head or any stored bytes. A separate independently valid+1/+4 branch yields a structural conflict; choosing main's first+4 also refuses without writes. Reload/Open retains the original head/document.
- Valid+4/+2.5 merge creates exactly1new snapshot and1version, updates main head, retains saved file and all previous snapshots, returns1554.9519628558871mm³ checked against an independent tapered-volume polynomial, and passes Undo/Redo.
- Actual1024 resolved-refusal and valid-merge screenshots reviewed. Source-frozen receipt SHA256 `05ee87f1cd4d012b49cebf64cf595697d6b6f106ba84d57f9d449601079c002e`. Browser first run PASS.

## Limits

Isolated project fixtures use product command/version/container functions; no application state injection. Actual branch inputs are individually valid, unlike stored-invalid recovery fixtures in D1340/1341. Stale timing is controlled-hook evidence. Native admission remains the bounded existing Open policy, not a new full-document universal geometry certification. Existing already-started storage-write custody is unchanged. Assistive technology, full suite and CI NOT_RUN. Existing HOLD remains. Next: audit remaining #20 reference-safety requirements and its native Open recovery guidance; do not close a partially verified umbrella issue.

# D1398 — reference placement draft ownership

## Scope and editing policy

Resolves #609. Reference placement fields are controlled raw drafts owned by the current document snapshot and saved six coordinates. App passes the stable document, not the potentially recreated ReferenceSet. Equivalent object/hover renders retain drafts. History, same-ID Open (including identical coordinates), and removal/restoration display current saved coordinates rather than stale defaultValue contents.

Enter remains the only commit action. It clones the current saved placement and changes only that axis. Blur does not apply. Any committed document revision, including one axis or another reference, cancels ALL unapplied placement drafts. Other dirty axes are not silently submitted. Existing finite-number fallback, including blank-to-zero behavior, is unchanged. Datum, envelope, parser and geometry behavior are outside this change.

## Verification

- Focused 10/10 PASS: all six axes/history, Enter after Undo, cross-axis/reference ownership, equivalent-object rerenders, same-ID/same-coordinate replacement, removal/restoration, and retained reference focus tests.
- Targeted lint, diff check, complete Studio TypeScript and production Vite build PASS. Existing unrelated App `_k` remains; no full-App lint claim.
- Actual Chrome WebGPU at 1024×800 and 1440×900: import two authored tetra OBJ references; every position/rotation axis Enter→Undo→Redo; blur-only draft; cross-axis and second-reference dirty drafts canceled after a commit; same-ID/same-coordinate Open; Remove→Undo→Redo; Save/fresh Open. All twelve displayed coordinates were compared with the current document at checkpoints. Original stock nodes and outputs remain unchanged.
- A separate Undo→Enter check confirms the restored rotation0 is used, not the old17. The first run also directly observed X50→Undo0→Enter0, but then failed on an overbroad Redo expectation described below.
- Actual 1024 other-drafts and1440 fresh-Open screenshots reviewed: six axes per reference are readable. Final source watcher changes/errors empty; four contexts/browser/server closed.

## Evidence and retained limitation

Final browser `/tmp/d1310-publish.1Wqzsz/d1398-second`; receipt SHA256 `958d212d1174febab865f40bef70651b72d745c58b1a1f5b4b6a969ffd4f6230`.
Build log `/tmp/d1310-publish.1Wqzsz/d1398-build.log`.
The first run failed because its sequence expected Redo to survive an unchanged-value Enter after Undo. Existing onPlace still commits that same value and clears Redo. This no-op history behavior is NOT repaired by #609. The final test separates uninterrupted Enter→Undo→Redo from Undo→Enter current-value verification. Only the driver expectation changed; no product workaround was added. The earlier failure is preserved, not presented as a full pass.
No new invalid-input validation, parser/Datum ownership fix, manufacturing, assistive-technology, mobile or whole-CAD claim. Existing HOLDs remain; #608 Rendering is still held. #610 reference face ownership is the next independent producer-boundary investigation.

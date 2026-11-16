# Own completed autosave checkpoint before Save — #620

Base: `6913c780df84aa1467872548d45a883cca5badd3`. Roadmap D520 P0 / row 12 document recovery; bounded follow-up to the existing unknown-age recovery warning. This is not a schema migration, checkpoint deletion, or general multi-writer ordering guarantee.

## Change

The project hook remembers the receipt of its own successfully completed autosave. Save captures only the current document session's completed checkpoint before starting the primary write. After accepting the primary receipt and tag, it records optional provenance in `.barocss/autosave-saved/<part>.json`: saved-file tag and SHA-256, and checkpoint tag and SHA-256. Recovery suppresses an offer only when all four identities still match. Checkpoint bytes remain untouched. Unknown, malformed, unreadable or stale metadata leaves recovery eligible with the existing warning. A newer checkpoint, including a new write of identical bytes, has a different tag and remains eligible. A checkpoint from another session is not adopted as this session's own receipt.

The optional metadata operation is non-blocking. Failure or interruption cannot delay primary Save acceptance or poison a subsequent Save's expected tag. An independent review caught that risk in the initial implementation; the final hook test holds the metadata commit while two primary Saves complete successfully.

## Verification

- PASS: 125 affected tests covering storage, own checkpoint suppression, newer/identical-byte checkpoints, hash mismatch, malformed metadata, failed Save, hook ownership and metadata failure/delay, Open, versions, merge and restore admission.
- PASS: final Studio TypeScript check and production build. Existing module directive and ineffective dynamic import warnings remain.
- PASS: actual desktop Chrome WebGPU, 1440×1000, synthetic OPFS project. A 30×12 mm part uses H=10; H=11 autosave completes; H=14 is explicitly saved before the next debounce. Primary file H=14 and recovery bytes H=11 are independently read. After reload/Open, H=14 is displayed with no stale offer. H=15 is then autosaved without Save; after reload, Restore yields H=15 while the primary file remains H=14. Reopened and restored screenshots were viewed.
- PASS: browser source capsule unchanged before/after/cleanup; no page or console errors. No geometry algorithm changed or accuracy claim added.
- First browser attempt: harness read the document before asynchronous Open completed. Added an explicit accepted-document wait; product code unchanged. Second run passed. First type command used the wrong relative compiler path; corrected command passed.
- Dependencies reused read-only from the existing local installation at the same base; original worktree files and #126 WIP were not edited. This is not a clean frozen-lockfile installation qualification.

Commands: Studio `node scripts/test.mjs autosave-save-boundary project-autosave-feedback storage.test project-recovery-warning project-open-ownership project-version-ownership project-merge-admission project-restore-admission`; `tsc --noEmit`; `vite build`; `test/autosave-save-boundary-browser.mjs` through the shared heavy-run gate.

## Remaining scope

#620 stays open. Native folder behavior has stand-in storage coverage, not actual folder UI qualification. Autosaves already in flight before Save are not given fabricated generation ownership; if their receipt was not known at Save start, recovery may still offer them. Unknown/other-session checkpoints and interrupted optional provenance also remain eligible. These conservative false-positive offers are preferable to hiding possibly newer work. #621's scoped OPFS lock and external-writer limits are unchanged. No release/deployment or HOLD expansion.

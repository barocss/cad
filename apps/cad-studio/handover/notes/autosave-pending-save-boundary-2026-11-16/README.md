# Pre-Save autosave requests with late receipts (#620)

Base: `8317558bc98a3aac0737fd76799da21f8e75cfe5`. This extends its same-session provenance fix, not the document schema or native directory locking contract.

## Change

Save captures the current session's autosave request counter. Only after accepting the primary write receipt does it associate that counter boundary with the saved receipt. A qualifying autosave receipt completed during or after Save can record the same exact-tag-and-SHA provenance. Requests started after the Save invocation remain eligible. The optional sidecar write never delays primary Save; no checkpoint bytes are deleted or rewritten. Unknown, stale, malformed or interrupted provenance continues to offer recovery conservatively.

## Verification on 2026-11-16

- `node scripts/test.mjs autosave-save-boundary project-autosave-feedback storage.test project-recovery-warning project-open-ownership project-version-ownership project-merge-admission project-restore-admission`: **129/129 PASS**. Four added real-hook/handle-adapter stand-in cases cover completion during Save, after Save, a newer request while Save is pending, and primary Save failure. The adapter stand-in is not native-folder qualification.
- Studio `tsc --noEmit`, production Vite build, changed TypeScript ESLint and `git diff --check`: **PASS**. Existing build warnings remain.
- `AUTOSAVE_BOUNDARY_FROZEN=1 AUTOSAVE_BOUNDARY_PENDING=1 node test/autosave-save-boundary-browser.mjs <output>`: **PASS**, real desktop Chrome, OPFS, 1440×1000. The driver holds the actual autosave writable `close` before committing H=11. Explicit Save of H=14 succeeds while close is held; releasing it retains recovery bytes H=11 and records provenance. Reload/Open shows H=14 without a stale offer. Subsequent H=15 autosave is offered and restored, while primary file remains H=14. No runtime/console errors; frozen source changes empty. Screenshots of reopened H=14 and restored H=15 were visually inspected.
- Independent read-only code review found no concrete safety blocker.

## Remaining scope

#620 stays open. Native-folder UI verification remains NOT_RUN and picker work is held. Unknown/other-session checkpoints are deliberately preserved. This is not a guarantee that a recovery offer disappears before asynchronous provenance has finished, or after provenance failure/interruption. Concurrent competing provenance writes may conservatively retain an offer; matching exact saved/checkpoint identities is still required for suppression. No claim of whole-CAD acceptance or hosted CI success.

Existing #126 uncommitted work and all roadmap HOLDs were untouched.

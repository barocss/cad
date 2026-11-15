# #621 partial mitigation: canonical OPFS mutation locks

Base: `455232ae45380588f8fc1dc0fa8d8498488c60e5`. This is **partial**, not closure of #621.

## Changed contract

`access.browserProject(name)` opens the canonical OPFS `projects/<name>` directory and passes that scope to `handleStore`. Those adapters use an exclusive Web Lock keyed by the project and validated relative file path, covering expected-tag validation, stream write/close (or remove), failure cleanup, and returned tag read. All writes, including unconditional writes, and removals share that exclusion. Different files/projects do not share a lock. JSON tuple encoding avoids delimiter collisions.

The lock is released by the browser when the callback settles or the owning page terminates. No timeout, lease stealing, or unsafe in-memory fallback is used for scoped browser projects. Without Web Locks, mutations refuse with `STORAGE_UNAVAILABLE` before creating/removing a file; reads remain available. The message tells the person to keep the tab open and export the document, or use a browser with Web Locks. App error/dirty-state rendering is not newly certified here.

Native picked folders and unscoped direct handle adapters keep their previous per-instance queue. Native identity/alias handling needs separate work. This change does not protect against old clients, direct OPFS writes bypassing the adapter, or other storage origins/partitions. Reload other open Studio tabs to have cooperating clients use this code. The size/lastModified tag remains a weak token; content collisions and transactions spanning multiple files are not solved.

Primary documents, autosave files, version logs and version snapshots each have independent path locks, not one atomic multi-file transaction. This does not solve #620's older-autosave recovery lifecycle, #622's Save As behavior, or prove general recovery from data loss. No autosave deletion was added.

## Verification

- Existing focused storage/project tests: **146/146 pass**, including prior native-adapter independence and late-save/autosave/branch/restore/merge ownership tests.
- Studio `tsc --noEmit`: pass.
- Changed source and new browser fixture ESLint: pass.
- Studio Vite production build: pass, existing module-directive and ineffective-dynamic-import warnings remain.
- `test/handle-store-multitab-opfs.test.mjs`: real Chrome, fresh isolated browser context, two same-origin pages, real OPFS and Web Locks. No user documents or authenticated browser profile. Passed repeatedly; final version includes tab termination.
  - Hold A before native close, then hold A's post-close receipt in a separate case. B's stale write and remove wait and then refuse `STORAGE_CHANGED`.
  - Other files and a separate project finish while A is held.
  - Exactly one of two expected-absent creations succeeds.
  - Close failure aborts and releases ownership for a later valid retry.
  - Missing Web Locks refuses both writes and deletes without modifying existing data.
  - Scoped same-tab unconditional writes preserve FIFO and each returned receipt.
  - Closing the receipt-owning page releases the lock for the waiting tab.

This is a storage-boundary fixture matching #621's real OPFS overlap, not a complete Studio UI reproduction. Dirty-state/error/recovery UI behavior and the full A/B-reversed document flow remain for follow-up. Full repository aggregate tests and CI were not claimed.

## Commands

From `apps/cad-studio`, using a supported Node version:

```sh
node scripts/test.mjs handle-store-concurrency storage.test project-version-ownership project-restore-admission project-branch-admission project-autosave-feedback project-merge-admission project-open-ownership late-save-ownership
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
CHROME=/path/to/chrome PW_DIR=/path/to/playwright node --test test/handle-store-multitab-opfs.test.mjs
node ../../node_modules/vite/bin/vite.js build
```

Official mechanism reference: <https://www.w3.org/TR/web-locks/>. The supported guarantee is cooperating writers in the same lock-manager scope, not an OS-level file lock.

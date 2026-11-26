# D2028 — Qualify local folder autosave provenance

2026-11-26 · P0/R02 · [#620](https://github.com/barocss/cad/issues/620)

The existing fixes record provenance for a session's already-committed ([8317558](https://github.com/barocss/cad/commit/8317558bc98a3aac0737fd76799da21f8e75cfe5)) and in-flight ([64bd8ba](https://github.com/barocss/cad/commit/64bd8ba462c7f1d86aeec4e0bb70df0cd081f437)) autosaves. OPFS was qualified. This pass covers the remaining local-folder workflow without changing product code.

## Evidence

Actual desktop Chrome 158, 1440×1000, WebGPU, and the normal Project & versions → Open folder → Open file, Parameters, Save, and Restore controls. Chrome receives a native handle from a protocol drop of the synthetic temporary directory; only the OS folder chooser is substituted. A disposable browser profile grants file writes. Node independently reads the real local files and checks exact checkpoint bytes and SHA-256 receipts. No real user files or profiles are used.

| Case | Result |
| --- | --- |
| Already committed autosave | H=11 autosaves, H=14 saves. Reload/Open lands on H=14 with no stale offer. The H=11 checkpoint bytes remain. |
| In-flight autosave | The real H=15 checkpoint close is paused; H=18 primary Save completes before the checkpoint close resumes. The receipt matches both files. Reload/Open lands on H=18 with no stale offer. |
| Failed Save and later recovery | H=19 autosaves after H=18. An injected rejection before primary writable creation leaves H=18 on disk, H=19 dirty, and the checkpoint intact. After reopening, Restore recovers H=19 as dirty without changing H=18 on disk. |
| File isolation | Opening the second native document shows its own H=20 without a recovery offer from the first document. Its exact bytes are unchanged throughout. |

The browser run has no runtime or console errors. The existing OPFS in-flight test, 75 affected Studio checks, Studio type check, and scoped ESLint pass. This does not requalify the OS chooser, prompt UI, native aliases, external writers, or cross-tab locking ([#621](https://github.com/barocss/cad/issues/621)).

## Reproduce

From the repository root, with desktop Chrome and a local Playwright installation:

```sh
FOLDER_AUTOSAVE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome \
  node apps/cad-studio/test/folder-autosave-save-boundary-browser.mjs /tmp/cad-folder-proof
```

See `receipt.json` and the captured states (notably `04-pending-suppressed.png` and `07-newer-checkpoint-restored.png`). The disposable profile and native fixture folder are removed after the run.

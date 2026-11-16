# Project recovery warning (#620 partial mitigation)

The project recovery checkpoint has no persisted save-generation provenance. Byte inequality does not prove that it contains edits after the last explicit Save.

Changed only the recovery banner to state that the copy may be older or from another window, and explain that Restore replaces the current document while the saved file remains unchanged until Save. Restore/Discard semantics and the storage format are unchanged. No checkpoint is deleted by this change.

Verification on 2026-11-16:
- Copy regression: 1/1 PASS (`node scripts/test.mjs project-recovery-warning`, Studio cwd, Node 22.19.0).
- Studio TypeScript and production build: PASS (existing dynamic-import/directive warnings).
- Actual desktop Chrome Studio, synthetic OPFS saved/recovery documents, 1440×1000 and 1024×1000: PASS for warning text, visible Restore/Discard controls, no runtime/console errors, frozen source checks. Driver: `test/project-recovery-warning-browser.mjs`; run with `RECOVERY_WARNING_FROZEN=1`, configured `PW_DIR` and `CHROME`. Screenshot reviewed at 1024 width.
- Full workspace suites, native-directory storage and recovery generation/race correctness: NOT_RUN.

#620 remains OPEN. This is not a fix for obsolete recovery offers. A complete solution must qualify save-generation ownership, overlapping writes, failed saves, and cross-window/native-store checkpoints without deleting newer recovery data.

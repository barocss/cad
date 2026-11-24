# D1962 — Expire a Parameters refusal after a valid edit

P1 [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md). [#44](https://github.com/barocss/cad/issues/44). Base `3c47b21f681162cb4a4ca9bc17c8c94ed6cc65e3`. Small Studio correctness change.

The Parameters panel and its worker refusals use the existing document-owned notice mechanism. An invalid edit keeps its message while the accepted document is current. The next valid document retires that message. Undo and Redo do not revive it.

- **FAIL, previous Studio.** The frozen D1961 after-state receipts show four width edits and one post-Open Rename that accepted the new document while displaying the previous refusal. The old screenshots retain each reproduced workflow.
- **PASS, desktop Studio.** A zero width still shows its refusal. The next accepted 50 or 60 mm width clears it at both 1024 and 1440 px. Undo and Redo keep the message cleared. A configuration name collision still displays its reason after project Open. The valid Rename clears that message.
- **PASS, state and geometry comparison.** All 12 checkpoints have equal before and after documents, body facts, selection, History and configuration bytes after excluding the notice text. Five obsolete notices are removed. The other seven notice states match. Actual configuration Save and reopen retain the same exact saved bytes.
- **PASS, affected checks.** 62 Studio checks, Studio types and production build, scoped ESLint and diff check.
- **NOT_RUN.** Other notice classes, mobile and full local suites. #44 remains open. First mechanical CAD remains 8/10. Overall CAD stays unmeasured.

```sh
PARAMETER_RETRY_SOURCE_FROZEN=1 node apps/cad-studio/test/parameter-geometry-retry-browser.mjs "$OUT/retry"
D738_SOURCE_FROZEN=1 node apps/cad-studio/test/parameter-rename-configuration-browser.mjs "$OUT/rename"
node apps/cad-studio/scripts/test.mjs new-parameter-input parameter-height-finish parameter-pattern-hole-spacing evaluation-evidence work-ownership drawing-notice-lifecycle
pnpm build
git diff --check
```

Comparisons use the exact D1961 current-source receipts and the D1962 browser receipts. Screenshots stay outside Git.

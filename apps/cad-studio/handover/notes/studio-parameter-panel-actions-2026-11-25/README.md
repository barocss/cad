# D1961 — Extract Studio Parameters panel actions

P4 [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md). [#44](https://github.com/barocss/cad/issues/44). Base `b9b0ee8cf0f2527c3ee516f48bb70c7c7d04401a`. Behavior-preserving refactor.

Parameter submission, skeleton resolution and refusal handling live in `studioParameterActions.ts`. App supplies the existing run and document readers, request counter, evidence and commit callback. App.tsx decreases from 2438 to 2427 lines.

- **PASS, actual desktop before and after.** Four retry states at 1024 and 1440 px cover a rejected zero width followed by first-submission acceptance at widths 50 and 60 mm. Undo and Redo retain the expected 5000 and 6000 mm³ outputs and the same configurations.
- **PASS, actual configuration roundtrip.** Eight states cover a name collision, a valid Rename, configuration Apply, local Save and project reopen, and a subsequent Rename. The 40 mm saved width produces 8000 mm³. The before and after documents, body facts, notices, history and observed source and save bytes match across all 12 states. The two saved project byte checks have the same SHA-256.
- **PASS, affected checks.** 58 Studio tests, Studio types and production build, scoped ESLint and diff check.
- **OPEN, reproduced existing notice.** The refusal notice still appears after a later valid edit in the before and after runs. D1962 tracks it separately.
- **NOT_RUN.** Full local suites, mobile and changes to parameter evaluation rules. #44 remains open. First mechanical CAD remains 8/10. Overall CAD is unmeasured.

```sh
PARAMETER_RETRY_SOURCE_FROZEN=1 node apps/cad-studio/test/parameter-geometry-retry-browser.mjs "$OUT/retry"
D738_SOURCE_FROZEN=1 node apps/cad-studio/test/parameter-rename-configuration-browser.mjs "$OUT/rename"
node apps/cad-studio/scripts/test.mjs new-parameter-input parameter-height-finish parameter-pattern-hole-spacing evaluation-evidence work-ownership
pnpm build
git diff --check
```

The before and after comparisons use the complete `states` and `observations` arrays from both desktop receipts.

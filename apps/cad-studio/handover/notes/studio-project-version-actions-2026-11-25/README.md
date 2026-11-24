# D1970 — Extract Studio project version actions

P4 [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md). [#44](https://github.com/barocss/cad/issues/44). Base `f4b439cbb282d92339775c47c7dcc33297e14506`.

`studioVersionActions.ts` owns named Restore, saved face repair preparation and opening Chat after attaching approval evidence. App supplies the existing ownership readers, evaluator and callbacks. Repair still checks document and Open ownership before applying its proposal. Restore retains comparison reset, the dirty flag and viewport Fit after accepted replacement. App.tsx decreases from 2433 to 2429 lines.

- **PASS, named Restore in desktop Studio.** All five recorded states match before and after the refactor. The 6 mm named version measures 2160 mm³, compared with 2880 mm³ for the 8 mm project Save. Restore leaves the working copy dirty. Explicit Save and fresh Open recover 2160 mm³. A later 10 mm edit measures 3600 mm³. The source and named snapshot SHA-256 values match across runs. The generated version IDs and log digests differ.
- **PASS, saved face repair through the attachment chip in desktop Studio.** Seven captured states cover the renamed-face refusal, explicit repair proposal and approval, Save, fresh Open and attachment while the working reference is unresolved. Both native inspector JSON records match byte for byte. The saved evidence survives reopen and the accepted width is 12 mm. State differences are confined to generated timestamps, proposal IDs and the affected version identifiers and hashes.
- **FAIL, full scripted desktop Chat turn.** Before and after the extraction, after the attachment chip appears, the test CLI exits without a code or tool result. Earlier runs also encountered a killed subprocess in the native inspector. For the comparison, a temporary driver ran the same bundled native inspector in process and removed the extra CLI wrapper process. The baseline and candidate used that same driver. The checks after the failed turn are NOT_RUN. The temporary diagnostic edits are outside the commit.
- **PASS, affected checks.** 84 Studio tests, including project version and Open ownership, native snapshots, approval comparison and saved face repair lineage. Studio types, production build, scoped ESLint and diff check.
- **NOT_RUN.** Paid live provider, mobile and full local suites. #44 remains open. First mechanical CAD remains 8/10. Overall CAD is unmeasured.

```sh
D764_SOURCE_FROZEN=1 node apps/cad-studio/test/project-named-version-restore-browser.mjs "$OUT/restore"
D662_SOURCE_FROZEN=1 node apps/cad-studio/test/nested-lost-face-evidence-browser.mjs "$OUT/face" --face-attachment
node apps/cad-studio/scripts/test.mjs project-version-ownership storage-version-snapshot project-open-ownership saved-face-repair-lineage approved-requirement-compare
pnpm --dir apps/cad-studio build
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/studioVersionActions.ts
git diff --check
```

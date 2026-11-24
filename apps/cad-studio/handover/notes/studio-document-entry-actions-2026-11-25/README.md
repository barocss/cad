# D1952 — Extract Studio document entry actions

P4 [row 12](../../roadmap-rows/12.md) and [row 20](../../roadmap-rows/20.md). [#44](https://github.com/barocss/cad/issues/44). Base `9755691b2f1a4fcfd630f0684c4d97f8d6fb8a44`. Behavior-preserving refactor.

The existing New Part, Template and Versions entry actions live together in `studioDocumentEntryActions.ts`. App supplies the current providers, the draft readers and the existing UI setters. App.tsx decreases from 2,450 to 2,438 lines.

- **PASS, actual desktop before and after.** Six New Part states preserve document identity, Undo/Redo, recovery name, saved status and project bindings. Eight Template states preserve the fresh document, clipboard ownership and Undo/Redo. Five Versions states preserve named restore, explicit Save and fresh project Open. Four Cage states preserve Keep/Escape focus, draft ownership, Save exclusion and applied native reopen at 1024 and 1440 px.
- **PASS, comparison.** The 23 matching snapshots agree on saved nodes and outputs, History rows, selection and body keys, volumes and centroids. The template snapshots also agree on file name, dirty flag and Undo/Redo availability.
- **PASS, affected checks.** Eighty-six focused Studio tests, Studio type/production build, scoped ESLint and diff check.
- **NOT_RUN.** Full local suites, live provider and native-folder picker. #44 remains open. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

```sh
D664_SOURCE_FROZEN=1 node apps/cad-studio/test/new-part-history-browser.mjs "$OUT/new" --fixed
D561_SOURCE_FROZEN=1 node apps/cad-studio/test/body-clipboard-template-browser.mjs "$OUT/template"
D764_SOURCE_FROZEN=1 node apps/cad-studio/test/project-named-version-restore-browser.mjs "$OUT/versions"
D1329_SOURCE_FROZEN=1 node apps/cad-studio/test/cage-draft-files-browser.mjs "$OUT/cage"
node apps/cad-studio/scripts/test.mjs project-open-ownership project-version-ownership document-file cage-commit-readiness
pnpm build
git diff --check
```

The identical desktop commands run before and after the extraction. Screenshots and comparison output stay outside Git.

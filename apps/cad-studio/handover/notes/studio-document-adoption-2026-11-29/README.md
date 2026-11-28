# D2262 — Separate Studio document adoption from App

P0/P4 [row 12](../../roadmap-rows/12.md) and [row 22](../../roadmap-rows/22.md) · [#44](https://github.com/barocss/cad/issues/44) · Base `6bad10d50`.

- **Decision.** Move the accepted-document guards and installation into a Studio state module. The same source and work scopes admit changes, consume the pending history intent and reserve accepted evaluation. The same paths retire editing state, invalidate a copied body on producer ID reuse and retain current reference problems for metadata-only edits. App still owns the refs and event wiring. Its line count decreased from 2,219 to 2,181.
- **PASS, paired actual desktop.** Pick the two original native Box corners, preview and cancel, then apply the exact source width. Undo and Redo, project Save, Close and fresh Open retain the same part. Open a distinct native file, Undo across that document boundary and Redo. Six complete Studio snapshot records agree, including document, bodies, selection and history. Applied and reopened native documents and independent B-rep records are byte-identical. The original and final runs have zero console errors.
- **PASS, affected checks.** Node 22.19.0, 88 Studio tests, Studio types, changed-file lint, Studio production build and whitespace.
- **FAIL, corrected extraction.** The first candidate captured the notice setter before its declaration. Restore the original deferred lookup. The final candidate opens and completes the paired desktop flow. Remove the unused App import identified by lint.
- **NOT_RUN.** Full local suites, alternate GPU backends, mobile and live Agent. No change in supported document, geometry, storage or reference behavior.

```sh
(cd apps/cad-studio && node scripts/test.mjs stop-work-ownership project-open-ownership project-open-fit project-restore-admission project-recovery-warning document-file command-apply)
node node_modules/vite/bin/vite.js build apps/cad-studio --outDir "$OUT/dist"
bash "$OUT/desktop.sh" base
bash "$OUT/desktop.sh" fixed-final
git diff --check
```

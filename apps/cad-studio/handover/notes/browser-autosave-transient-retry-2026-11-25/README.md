# D1965 — Retry a transient browser-project autosave abort

P0 [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md). [#170 DOC-05](https://github.com/barocss/cad/issues/170). Base `66cfdc321032d32298a8a644178ecacdffe47672`. Feature change to browser-project recovery.

A browser-project autosave retries one native `AbortError` for the same current unsaved document. Document, project, path, Open scope, request order and primary Save ownership must still match. The retry checks ownership inside the write lock and after buffering, before native close. The existing denied, exhausted and other failure paths retain their warning and last successful recovery bytes.

- **FAIL, previous Studio.** After a confirmed H11 checkpoint, an injected abort during native close for H14 left the H11 recovery bytes and displayed the warning. The H10 primary file was unchanged. No second write occurred.
- **PASS, actual desktop Studio and OPFS.** The same transient failure retries once and writes the H14 checkpoint without more input or a Save. The H10 primary stays byte-identical. A newer H16 edit supersedes in-flight H15. A manual H17 Save revokes another pending retry. Two injected aborts for H18 produce one warning and no third attempt. H19 Save also cancels a retry after its stream starts writing and before close. Both saved bytes and the previous recovery bytes are verified independently through native file handles.
- **PASS, actual recovery.** H20 retries successfully. Reload and project Open show the H19 primary and offer the H20 checkpoint. Restore recovers 4000 mm³ with the H19 primary unchanged. All simulated interruptions are confined to the nominated real OPFS writable.
- **PASS, controls.** Current desktop write denial does not retry and preserves the prior committed copy. The existing reload-before-close flow still restores only the committed copy. 77 focused Studio project and ownership tests, Studio types and build, scoped lint and diff check pass.
- **NOT_RUN.** Spontaneous device failure, native folder retry, cross-tab Save and recovery changes tracked separately, mobile and full local suites. #170 stays open. First mechanical CAD is 8/10 accepted. Overall CAD remains unmeasured.

```sh
D1965_SOURCE_FROZEN=1 node apps/cad-studio/test/project-autosave-interruption-browser.mjs "$OUT/prior" --with-transient-abort --baseline
D1965_SOURCE_FROZEN=1 node apps/cad-studio/test/project-autosave-interruption-browser.mjs "$OUT/studio-final" --with-transient-abort
D768_SOURCE_FROZEN=1 node apps/cad-studio/test/project-autosave-interruption-browser.mjs "$OUT/denial-control" --with-write-denial
D596_SOURCE_FROZEN=1 node apps/cad-studio/test/project-autosave-interruption-browser.mjs "$OUT/reload-control"
node apps/cad-studio/scripts/test.mjs project-autosave-feedback project-open-ownership late-save-ownership project-storage handle-store
pnpm build
git diff --check
```

The retry can revoke an uncommitted stream before native close. The existing receipt handling covers a native close that has already started. Screenshots and recovery results stay outside Git.

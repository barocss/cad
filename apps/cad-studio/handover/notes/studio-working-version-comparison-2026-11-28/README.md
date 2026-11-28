# D2148 — Extract Studio working-version comparison

P4 [row 12](../../roadmap-rows/12.md) · Base `24076e8d5caaa0cc2df9295102e1add6e5e0b026`.

The storage hook owns the selected version, working-document comparison and asynchronous geometry overlay. The Versions panel and hook share the project, document and snapshot lookup. App passes the current state and keeps the existing workspace and viewport connections. App changes from 2,342 to 2,330 lines.

## Verification

- **PASS, actual desktop before and after.** Compare a saved 30 × 12 × 6 mm extrusion with the current height of 10 mm. The current part measures 3,600 mm³, and the Boolean overlay reports 1,440 mm³ added. Choosing the second saved version at 8 mm clears the working overlay. Returning to the working target restores it. Hide and Close Project clear the overlay. Fresh Project Open preserves the 10 mm working file and starts with no comparison. The native working file and both snapshot contents have the same hashes before and after the refactor. The comparison does not write the working file, version log or either snapshot in either run.
- **PASS, actual named Restore control and affected checks.** The existing Save, named Restore, dirty state, explicit Save and later edit survive. 48 Studio tests, Studio types, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0. Baseline, candidate and Restore freeze 1,282, 1,283 and 1,283 files with zero source changes, page errors or console errors.
- **FAIL, corrected during implementation.** The first extracted hook read the revision reference before initialization, and Studio could not mount. The hook now starts after the existing revision reference. Both final desktop flows pass.
- **NOT_RUN.** Other project branches and concurrent version writes in the actual browser, external CAD, mobile and full local suites. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
D764_SOURCE_FROZEN=1 node apps/cad-studio/test/project-named-version-restore-browser.mjs "$OUT/final" --compare --comparison-hook
D764_SOURCE_FROZEN=1 node apps/cad-studio/test/project-named-version-restore-browser.mjs "$OUT/restore-control" --comparison-hook
pnpm --dir apps/cad-studio test project-version-ownership storage-version-snapshot version-tools-mcp proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

# D1903 — Edit an independent definition note after native reopen

P3 [row 10](../../roadmap-rows/10.md), [#274](https://github.com/barocss/cad/issues/274). Base `3a68bbc616f5157da4926697664ab5307e360fcc`.

Complete the remaining desktop flow for the ordinary made-part definition note. Select one of two shared occurrences, use Make independent, edit its note, then save, close the browser context, open the native file and edit its note again. The existing product passed. This delivery adds a repeatable browser test.

- **PASS, desktop Studio.** Seven actual WebGPU scenes and six actual browser downloads. The selected occurrence `p2` changes from `sharedA` to definition `part1` and keeps that definition through both edits, Undo/Redo and two native Save/fresh Open cycles. `p1` retains its original full Field. `p3` retains its absent note. All three part documents, positions and rotations match the original after excluding the explicitly changed note and definition revision.
- **PASS, BOM and approval record.** Both actual notes CSV files parse as one row of quantity 3. They carry separate `p1`, `p2` and absent-`p3` entries. The final `p2` Field retains Unicode, quotes, a newline and formula-like text within the JSON cell. Both default purchase CSV downloads are the same 81 bytes. BOM totals stay at 3 parts and 0.8 g to the displayed precision. The synthetic saved approval record remains exact and intact. The currentness check names only `part p2`.
- **PASS, affected checks.** 31 focused Model tests, 22 focused Studio tests, browser syntax and Git diff check. Model and Studio cover invalid and long notes, absent and mixed values, shape identity, baseline integrity and history.
- **FAIL.** No failures in this delivery.
- **NOT_RUN.** Whole local suites, a new pinned-reader run, nested and bought parts, schema migration, manufacturing approval and mobile. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

The original ordinary-part acceptance also uses the retained [shared edit](https://github.com/barocss/cad/issues/274#issuecomment-6940501491), [explicit Clear](https://github.com/barocss/cad/issues/274#issuecomment-6943292401), [linked Keep and Accept](https://github.com/barocss/cad/issues/274#issuecomment-6945203134), [owned BOM response and recovery](https://github.com/barocss/cad/issues/274#issuecomment-6947934297), [consent reset](https://github.com/barocss/cad/issues/274#issuecomment-6949811315), [native download and pinned reader](https://github.com/barocss/cad/issues/274#issuecomment-6982905258) and [pending revision comparison](https://github.com/barocss/cad/issues/274#issuecomment-6985003268) records. The Keep button calls the existing revision dismissal. The pinned reader check covers schema 3 and the recorded schema 4 root bundle. The issue can close after this commit's exact CI and actual scene publication.

```sh
pnpm --dir packages/barocss-cad-model test bom-design-brief-notes bom-parameter-identity definitions team-baseline
pnpm --dir apps/cad-studio test instance-brief-notes bom-brief-notes-ui instance-revision-notes
D1903_SOURCE_FROZEN=1 node apps/cad-studio/test/independent-definition-notes-browser.mjs "$OUT/studio"
node --check apps/cad-studio/test/independent-definition-notes-browser.mjs
git diff --check
```

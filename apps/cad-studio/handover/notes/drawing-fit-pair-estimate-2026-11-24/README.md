# D1874 — Verify paired fit dimensions and estimate provenance

P2 [row 11](../../roadmap-rows/11.md), [row 13](../../roadmap-rows/13.md), [#269](https://github.com/barocss/cad/issues/269). Base `3f53c879d4f6284cca564f922b150f16e090ef94`. SMALL evidence qualification. The existing single-sheet fit list consumes synthetic rows for a sourced H7 bore and an estimated g6 shaft of the same Ø12 nominal.

- **PASS, actual Chrome desktop.** Two authored diameter IDs on the bore produce two separate rows. The pair uses the two authored face names and identifies the supplied H7 row and estimated g6 row. Replace the table through Library, remove one dimension, and restore it with Undo. Clear the shaft class via the real Fit class command with the named fixture face selected. Both remaining rows retain the H7 values and drop all g6 text. Undo restores the pair. Native Save and fresh Open retain both dimension signatures, the pair and the edited table.
- **PASS, independent SVG/DXF reads.** The original Blob bytes match the Studio sheet. The first bore limits are [12, 12.018] mm and shaft limits are [11.983, 11.994] mm. The replacement limits are [12, 12.020] and [11.981, 11.992] mm. Independent decimal arithmetic gives clearances of 6–35 and 8–39 µm. Deletion exports only `fit-a`. Clearing the class drops the old pair from both files. The reopened sheet restores both edited rows. Five paired export comparisons and three single-class control comparisons pass.
- **PASS, affected checks.** 26 Model tests, three Studio tests, driver syntax and Git diff check. The two final source-frozen desktop runs record ten states, zero browser errors and no source changes.
- **FAIL, initial harness checks.** The first Fit class shortcut was sent while a button retained keyboard focus. The test now uses the Inspect command. The unsigned fixture first acquired drawing signatures with its Model edit. A signed fixture then exposed a JSON key-order mismatch in the Open check. The final test compares the admitted fixture semantically and still requires exact authored signature preservation. An initial Studio runner filter named no tests. The correct filter passes all three.
- **NOT_RUN.** Late fit-list responses after document replacement, the remaining unsupported-scope matrix, further unit profiles in this fixture, PDF, mobile and full local suites. The item verifies one open-issue acceptance slice. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
D1874_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/drawing-fit-list-browser.mjs "$OUT/pair-sheet" --pair
DRAWING_FITS_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/drawing-fit-list-browser.mjs "$OUT/single-sheet"
pnpm --dir packages/barocss-cad-model test fit-drawing drawing-fit-list p2-drawing-table-contract drawing-tolerance-printable
pnpm --dir apps/cad-studio test fit-list-settings
node --check apps/cad-studio/test/drawing-fit-list-browser.mjs
git diff --check
```

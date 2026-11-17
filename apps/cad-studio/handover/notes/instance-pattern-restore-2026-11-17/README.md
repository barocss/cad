# Restore one skipped pattern occurrence

Baseline `e945a93aa`. The instance-pattern seed panel now offers Restore N for each skipped occurrence, alongside explicitly named Restore all. The former UI could only restore the entire skip list. Public numbering counts the seed as 1, matching occurrence names and the existing Skipped display.

This is a narrow Studio consumer of the existing `editInstancePattern({id,skip})` transaction. Other exclusions remain in the array, and Model admission/solve/reference guards remain authoritative. Source geometry, schema, kernel and public APIs are unchanged.

## Verification

- Focused Studio tests 5/5, final Studio type check, targeted lint and diff check PASS.
- First actual Chrome run PASS: five-instance linear X pattern at 25 mm spacing; skip occurrences 3 and 5; restore only 3, leaving 5 skipped.
- Stable IDs/shared definition and literal independent X positions [25,50,75] for live copies, unchanged seed/base source.
- Undo/Redo, actual native Save download, fresh Open preserve skip[4]; Restore all then restores occurrence 5 at X100.
- Two screenshots directly reviewed; own synthetic cube/plate fixture only.
- Existing broad pattern browser driver's full-restore selector changed only to the new explicit name. That entire historical driver was not rerun; the new driver exercises both single/all restoration.

NOT_RUN: actual circular/mated/nested patterns or exchange export; no new Model correctness/whole assembly acceptance claim. Existing HOLDs preserved.

Run: `PATTERN_RESTORE_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/instance-pattern-restore-browser.mjs <artifact-dir>`.

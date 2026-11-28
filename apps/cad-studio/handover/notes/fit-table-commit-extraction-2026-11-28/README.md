# D2229 — Move fit-table admission out of Studio App

P4 [row 12](../../roadmap-rows/12.md) and [row 25](../../roadmap-rows/25.md) · Base `b3db8d28f`.

`useFitTableCommit` owns the Library's full-model check and the pending fit-table request. It compares the current request, document, open intent, Worker session, evaluation and work generation before displaying the reply or committing the edited tables. Studio App goes from 2,250 to 2,234 lines.

- **PASS, actual desktop before and after.** The Library refuses removal of the only table covering the current Ø12 g6 fit. Reimport changes the row with the same ID in place. Adding a replacement table allows removal of the old one. Undo restores both tables and Redo selects the replacement result. The original body volume stays at 2,714.336053 mm³. Three paired snapshots agree on the full document, selection, history, bodies, dirty state, freshness, file name and notices.
- **PASS, affected checks.** Nine Studio tests, scoped lint, Studio types, production Studio build and whitespace.
- **FAIL, first type check.** The extracted signature described the work generation as a number. It uses the existing object identity type. The corrected Studio checks and paired desktop snapshots pass.
- **NOT_RUN.** In-place assembly Library edits, active variant changes, manufacturing, independent files or providers, full suites and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before apps/cad-studio/test/fit-table-removal-browser.mjs
bash "$OUT/checks.sh"
node "$OUT/compare.mjs"
git diff --check
```

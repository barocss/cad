# #255: retire stale local library-file reads

Baseline `446c662afe629e743424af355406ec892cb6198d`. P0 source ownership follow-up to D572, not a new library/version policy. D572 already inserts the displayed entry instead of re-registering the document's embedded entry. Its pending-file cases were explicitly NOT_RUN.

## Reproduced defect and bounded fix

Actual baseline `/tmp/cad-library-file-ownership-before-02` reproduces two defects: after newer C finishes, releasing older B replaces C in the displayed registry and browser user-library store; after closing Library, releasing B still registers and persists B. Both use valid own manifests with the same ID/version. Geometry, document, history and selection did not change, but the library source did. The first baseline attempt is retained: its abbreviated test manifest omitted required `parameters: {}` and was refused before reaching the race. The fixture and local empty-font response were corrected, not product admission weakened.

`createLibraryFileReader` owns one panel/session's request sequence. Only the newest request may parse/register or report an error. Cleanup retires pending success and failure; future reads still work after effect cleanup/replay. Registration stays synchronous with the ownership check. `LibraryPanel` receives App's existing accepted `docGeneration`, memoizes a reader for that session and cancels the previous reader in layout cleanup. A successful whole-document change invalidates the old read; an unsuccessful Open or ordinary same-document edit does not.

Do not key/remount the entire Library panel: that would restart team loading and reset unrelated catalogue drafts. No registry/model API, store serialization, provenance metadata, Insert/Place, explicit regenerate, sharing policy or other catalogue reader is changed. No automatic upgrade of existing parts.

## Verification

- Focused reader tests **6/6 PASS**: reordered success, malformed stale payload, stale rejection, cancel/replay, separate sessions, current read/parse/register errors, newest failure still retires older success.
- Existing library-tools **3/3 PASS**. Studio tsc and affected lint PASS; Vite build **4.09 s PASS**.
- Actual fixed Chrome `/tmp/cad-library-file-ownership-after-01/receipt.json` **PASS**:
  - C finishes, B later resolves: C remains shown and persisted.
  - Close then B resolves: no registration/store entry; reopening stays clear.
  - Accepted Open of a document embedding C then B resolves: C, document, history and selection remain intact.
  - Invalid JSON Open: accepted document/session survives and current B read still succeeds; explicit fresh selection works after either Open outcome.
- Native/console errors, source changes and downloads are empty. All contexts, browser and server closed. Root viewed `accepted-open-after-release.png` showing `embedded-C` and `Latest library C`; acceptance worker also viewed the failed-Open state. Registry identity is observed via panel rows and persisted JSON, not a new internal registry hook.

Run under the shared heavy gate with all writers frozen:

```sh
LIBRARY_FILE_OWNERSHIP_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node apps/cad-studio/test/library-file-ownership-browser.mjs /tmp/new-artifacts --expect=fixed
```

`--expect=repro` records the two original races against the old product; it is not a passing mode for fixed product.

## Scope and remaining #255 audit

This does not certify every #255 requirement. D572's Insert/Place, exact source/provenance, first Undo/Redo and Save/Open evidence remains historical and was not rerun. Forced stale-entry clicks, browser store failure, team response/sharing races and all model admission/refusal permutations are not newly qualified. New/template/project/recovery use the accepted generation boundary in source; only external accepted and failed Open are exercised here. Other catalogue file readers and team/share async workflows are outside this local-library-file fix. #255 remains OPEN for the final original-condition audit.

No native inspector subprocess was used; #257's SIGKILL and old units golden failure remain unresolved and were not repeated. No GPU shared code, original eight #126 WIP files, native folder, Shell, manufacturing, PDF or other HOLD scope changed.

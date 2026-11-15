# D1329 — Protect unapplied cage drafts at Save and New part (#562)

## Implementation

App New part supplies the current cage session identity to the existing useWorkspaceModeExit guard. Keep/Escape retains the exact draft and restores focus after dialog dismissal; Discard uses existing document replacement. The global workspace guard is not changed, so Model/Render/Drawing round trips retain cage work.

Save tooltip explains that only the applied part is saved. `useStudioDocumentFiles` captures an optional exclusion hint and reports it only after successful download/project receipt/version receipt. A pure `unappliedSaveNotice` requires matching document/name/token ownership, latest save-family request and still-applicable hint. Older completions cannot replace a newer save's notice. Save/shared copy/version bytes, dirty handling and explicit Done boundary remain unchanged. Removed one pre-existing unused local fileName destructuring in the touched file.

## Independent Mac verification

- New notice3/3 plus existing save-ownership9/9 PASS. These pure/ownership tests are not live project-storage fault injection.
- Studio type-check, file-hook/helper focused lint, production build and diff check PASS. App lint remains FAIL solely on the pre-existing `_k` unused binding at2359; no new App lint errors.
- Actual public box with unapplied Crease at1024×900 and1440×900: Save preserves draft while downloaded native file retains applied base; excluded-draft toast is visible. Render Command-S downloads and shows the same warning.
- Model/Render/Drawing round trips preserve exact cage, selected edge and Undo depth. Repeated New part Keep/Escape in Model and Render preserve exact state/document. Keep restores prior focused control after asynchronous dialog close.
- Done then native Save/fresh Open retains the edited cage. Explicit Discard before New part clears the draft; document Undo restores the last applied document, not an implicitly committed draft.
- `test/cage-draft-files-browser.mjs` frozen receipt SHA256 `4634e201a9245169cabf4d16290abe5608fb96299926474d96c8d94a9319cafc`. Actual screenshot visually reviewed.
- Initial driver asserted focus before dialog close autofocus settled; bounded wait verifies actual restoration. No product change was needed for focus.

## Limits / next

Browser uses Crease as the unapplied geometry change, not the original4mm drag. Live project/version/shared-copy failure injection, browser exit, other file-opening paths, mobile/AT and full suites NOT_RUN. Existing generated-doc drift stays separate; CI not awaited. All HOLDs persist. Next D1330/#563: preserve active draft on same-cage Edit cage reentry and protect switches to another cage.

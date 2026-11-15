# D1403 — Clearance Near drafts

## Scope and implementation

Issue #614: Clearance Near now separates the raw editing string from the committed analysis band. Enter or blur applies only a finite positive value; Escape restores the committed band. Blank and invalid drafts remain visible with an accessible field-local explanation naming the still-active band. A document owner change cancels the draft. Leaving Clearance commits a valid blur first and discards an invalid draft on unmount; App retains the committed band. Fresh sessions start at 1 mm. This is transient analysis state, not model serialization or a history edit.

Product paths: `src/viewport/ClearancePanel.tsx` and the `resetKey={doc}` prop in `src/App.tsx`. Existing finite-positive constraints and clearance algorithms are unchanged. The adjacent preview-number browser driver now explicitly commits both kinds of draft after arrow/spinner actions; no expected validity or numerical assertion was removed.

## Validation

- Focused component and native clearance tests: 13/13 PASS; target lint and Studio TypeScript PASS.
- Production build PASS on the combined local D1402/D1403 tree. D1402 tolerance placement is independent and is not claimed as part of this issue.
- Actual Chrome at 1024×800 and 1440×900: PASS for 0.301 → select-all/delete → sequential 0.35; empty/zero/negative drafts, partial decimal observation, Enter/blur/Escape, repeated editing, None transitions, same-ID document replacement and fresh Open.
- Independent fixture has a 14 mm gap between two 10×8×6 mm blocks: actual candidate counts at Near 13.9/14/20 were 0/1/1 with minGap 14. Exact document equality throughout Near editing and an independent Print history sentinel establish that Near adds no history entry. Undo/Redo retained the sentinel behavior. Save/fresh Open retained model data and reset transient Near to 1.
- Adjacent Print/Clearance native validity, physical arrow/spinner observations, Undo/Redo and Save/fresh Open browser regression: PASS at both widths.
- Both browser receipts: zero page/console errors, zero watched source changes; all contexts, browsers and servers closed. Direct visual review of the 1024 blank-error and 1440 Near-14 screenshots confirmed readable recovery and the single 14 mm candidate.

Evidence receipts retained locally: `d1403-first` SHA256 `0b181369d5444f51dc79f5d25e3402a4563249b5452f18d76c73632f2f002583`; `d1403-neighbor` SHA256 `a5683932fcb5b837a20e5fa75703fd7a4cc3a268952dd316608075ed7632aafb`.

## Limits

Desktop synthetic fixture only. Assistive technology, mobile and actual IME composition NOT_RUN. No manufacturing, full-suite, CI or all-CAD acceptance claim. Existing six baseline drawing failures, API inventory drift and all HOLDs (including #608) remain unchanged. #613 remains a separate partial/open placement issue.

# Selected assembly-step member takeout: partial #207 evidence

Date: 2026-11-18. **#207 remains OPEN.** This is a bounded selected-member authoring improvement, not whole-issue completion.

## Scope

An explicit **Take selected out** action removes at least two exact current-step member occurrence IDs in one membership edit. Selection admission is all-or-nothing: mixed other-step/unassigned, nested, missing, reserved or duplicate identities are not silently filtered. Duplicate retained members are not normalized as an incidental cleanup. Existing single-member removal remains available. No schema or core changes were made; no placements or part definitions are edited.

The input is synthetic: three same-name occurrences sharing one definition. Public Outliner selection distinguishes occurrence IDs rather than names.

## Verified result

- Baseline01 PASS: no batch control; two individual removals require two edits, and one Undo restores only the last removal. This is a missing UI capability, not a core atomicity defect.
- Check02 PASS: Studio **32/32**, Model **35/35**, Studio type-check and lint.
- Actual03 PASS: exact p2/p3 batch removal; one Undo restores both and Redo is exact. Mixed selection stays disabled, while the existing single-member path still works.
- Pending Name/Note drafts block batch action. Real pointer attempts at the disabled control preserve draft text, focus, document and history. Reverting the name enables batch; blank required-name Enter resets without an edit.
- Text commits remain separate: Name Enter and Note blur accept exactly the expected metadata. For the close/reopen case, **Shift+Tab from Note reaches Details and commits the note on blur; a separate Enter closes Details**. Reopen retains that accepted note. A later keyboard batch edit and its Undo preserve the accepted text commits.
- Complete accepted source outside membership is compared. Native Save and fresh Open preserve the full final accepted document. Product/console errors: 0 in actual03.

## Failure history and qualification boundary

1. Check01 failed lint on unused test bindings `_old`/`_next`; actual execution was NOT_RUN. The comparison-equivalent lint correction was independently reviewed before check02 passed.
2. Actual01 failed a fixture pre-hit assertion: it expected the disabled button itself, although the shared Button uses `pointer-events: none`. The oracle was corrected to require the disabled state, computed pointer behavior, and exact direct wrapper at the button center. Later pending-pointer/Note/Save-Open phases were NOT_RUN in this attempt.
3. Actual02 passed pending Name/Note pointer-focus/document checks. In the added dirty-Note pointer-close case, the note blur commit was accepted exactly, but Details remained open. Later keyboard batch and Save/Open phases were NOT_RUN. **Same-pointer dirty-note close remains unqualified.** A moving target after layout change is only an inference, not a confirmed cause.
4. Actual03 passed the separately qualified **Shift+Tab blur commit, then Enter close** path. This does not erase or reclassify the actual02 failure.

A refused Note commit followed by unmount, captured-stale-callback actual races, unrelated-document commits while a text draft is pending, nested/pattern actual cases, and an independent geometry/mass oracle were **NOT_RUN**. Source guard review does not qualify those dynamic cases. Source equality is not an independent geometry oracle. Undo/Redo establishes the edit boundary without private history-stack inspection.

## Images

- [Baseline](baseline.png): selected p2/p3 with only individual removal controls.
- [Selected](selected.png): exact members selected and batch action available.
- [Removed](removed.png): empty current step after the batch; parts remain placed and separately accepted metadata is retained.

`summary.json` records the bounded results. `SHA256SUMS` covers this README, summary and three images. Only curated synthetic evidence is included; raw receipts, source maps, local paths and credentials are excluded.

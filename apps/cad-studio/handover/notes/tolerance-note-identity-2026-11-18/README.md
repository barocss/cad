# #687: general tolerance note identity across sheets

Baseline b86efae94: first sheet note n1 contains KEEP ORIGINAL. Accept the general tolerance note on Top sheet: it reuses n1 and loses S2 membership. Toggle Hidden lines on the first sheet and both n1 records become the tolerance text, losing the original. Baseline02 actual Chrome reproduces this, with duplicate-key warnings and the expected original-preservation assertion failure. Baseline01 was NOT_RUN beyond Open because its JSON-order equality wait was wrong; corrected to semantic equality before baseline02.

Fix reserves all note IDs through ephemeral sheetContext.noteIds, plus the current sheet's notes. The existing mergeSheet new-note rule then assigns S2 normally. No changes to saved pre-existing duplicate IDs or merge semantics.

Focused tolerance regression 22/22, changed-file lint, Studio TypeScript, independent read-only review PASS. Frozen Chrome verifies actual Accept creates n2/S2, later first-sheet edit preserves n1, explicit removal affects only n2, Undo/Redo, exact native Save/Open, and actual SVG text on each sheet. Images show both reopened sheets. Two contexts/browser/server closed; source unchanged. Existing drawing-sheets PDF golden mismatch is outside this change and no whole-suite pass is claimed.

# Frame section row History (#28, partial)

For a library-backed section, the old numeric section-field loop treated its ID as a dimension (`s.id`). A string ID became NaN and disappeared from NodeEditor, so the row could not be replaced. The pre-change model test records this failure in `/tmp/cad-section-row-before.log`.

History now offers Section row only for already library-backed Frame/Frame member sections. Options use the current document's section catalogue. Missing or duplicate current IDs remain explicit rather than appearing to select another row. A setter checks the current node kind/library state and unique target ID; it changes only section.id. Inline/sketch section editing remains unchanged. This does not convert inline sections to catalogue references or replace per-member overrides.

The field closure can recheck its captured catalogue. Replacing the entire document is guarded by the existing NodeEditor/App document ownership boundary, not by this model helper. Do not interpret the captured-catalogue unit test as a document replacement test.

## Verification

Model coverage includes original numeric-ID failure, valid row choice, missing/duplicate rows, invalid/stale-kind setter, inline dimensions, native section change and unchanged explicitly overridden member mesh/volume. Actual Chrome driver `test/frame-section-history-browser.mjs` covers both Frame and Frame member: Cancel, R20→R30 Apply, Undo/Redo, memory-file reopen and switching back.

Independent Python verifies a bottom-left-anchored 100 mm member: R20 is 20×10×2 mm, bounds [0,0,0]–[20,10,100], volume 10,400 mm³; R30 is 30×10×2 mm, bounds [0,0,0]–[30,10,100], volume 14,400 mm³. The row catalogue and every other node field remain unchanged. No physical download or manufacturing qualification.

#28 remains open for its other Frame/connector placement and failure-guidance items. WIP/HOLD preserved.

Final checks: related Model tests 12/12; targeted lint and full Model/Studio TypeScript pass. Frozen actual Chrome and the independent bounds/volume oracle pass for both node kinds; screenshot inspected. Production build passes. Receipt: `/tmp/cad-frame-section-browser-01`. Choice labels retain section dimensions and `(estimate)` qualification where applicable.

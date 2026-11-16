# Terminal Mount group History (#31)

History now opens **Edit Mount** for the terminal saved Mount owner. The model helper structurally validates the group; native evaluation happens only during build. It evaluates the original prefix, resolves the exact saved body reference and one exactly named planar face, then replays the full original group against the current catalogue before accepting any edit. Missing/ambiguous faces, changed recipe rows, altered group members and malformed provenance are refused, not geometrically guessed.

The command rebuilds the complete range through existing Mount limits and replaceRange. Pilot through/recess changes may alter the number of cuts; the terminal feature ID and ordinary Studio output key remain stable while their node index updates. Prefix nodes and catalogue remain intact. App's existing saved-command live source guard retains document/evaluation/worker/marker/variant authority until Apply. NodeEditor only receives the existing saved-command capability; no new callback props or commit ownership were added.

## Verification

- Model related tests 12/12: motor/servo, row and pilot change, exact replay, source/face/row refusal, stale command, no-op and mutation checks. Full Model TypeScript and targeted lint pass.
- Studio History/HUD tests 35/35, full Studio TypeScript, targeted lint and production build 4.58s pass.
- Frozen actual Chrome driver `test/mount-history-browser.mjs`: grouped History entry, Cancel unchanged, off-face refusal, X85 / 90° / pilot recess rebuild, range-count change, output key and terminal ID retention, Undo/Redo, memory-file reopen and retained values. No physical downloads or browser errors; screenshot inspected.
- First browser assertion incorrectly required the output node index to stay fixed when a cut was added. Corrected test verifies stable output key and its new terminal index. Product code unchanged between browser runs. Final receipt: `/tmp/cad-mount-history-browser-02`.

## Scope

Terminal saved groups with exact provenance are supported. Non-terminal groups, lost merged-face names, altered intermediate operations and arbitrary authored output arrangements are not reconstructed. No automatic face reconnection or manufacturing qualification. Catalogue refresh was separately fixed in dda32add9835ddfdb1e130531d3290d38dea238e. #126 WIP/HOLD untouched.

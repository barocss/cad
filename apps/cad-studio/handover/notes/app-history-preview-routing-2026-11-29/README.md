# D2276 — Extract Studio history preview routing

P4 [row 12](../../roadmap-rows/12.md) and [row 22](../../roadmap-rows/22.md) · [#44](https://github.com/barocss/cad/issues/44) · Base `5565b3449`.

- **Decision.** Move Align and opposite Flange preview worker requests, live owner checks and body ordering into `useStudioHistoryPreviews`. The App still owns the document, worker scope, shared revision and feature admission. Preserve the held-draft, Align and Flange preview order. Keep the Align-only readout used by the existing Studio verification hook. App shrinks from 2,143 to 2,133 lines.
- **PASS, actual desktop.** The same two headed Chrome drivers passed before and after. Align retargets the original native face and previews line-up and gap. Delayed earlier replies, an invalid gap and Reset preserve the accepted document. Apply, Undo/Redo and fresh file Open give the same native boxes. The opposite Flange keeps its original owner, refuses R19 and previews R3. Apply, Undo/Redo and project Save, Close and fresh Open preserve both original bend owners and the expected native flat geometry.
- **PASS, audited equivalence.** All 16 recorded document, selected-body, preview, editor and history states and eight independently read native outputs match before and after. The runs froze 1,309 and 1,310 source files respectively. No errors or downloads in the passing runs.
- **FAIL, initial implementation.** The first extracted build stopped at App startup. The Align-only Studio verification readout still referenced the removed local. The refactor now receives that readout from the extracted hook, and both complete desktop flows pass.
- **PASS, affected checks.** Node 22.19.0, 66 Studio tests, Studio types, changed-file lint and the production build.
- **NOT_RUN.** Full kernel, mobile, and broader #44 acceptance. No test or product behavior was added for those scopes.

```sh
bash "$OUT/desktop.sh" baseline
bash "$OUT/checks.sh"
bash "$OUT/desktop.sh" fixed
node "$OUT/compare.mjs"
git diff --check
```

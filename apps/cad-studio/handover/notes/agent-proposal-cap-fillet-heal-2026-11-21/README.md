# D1469 — Qualify an agent proposal for exact cap-fillet repair

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `4c1a5ed0e0d94653bbdf9f2de3de068c4d1474ff`. This is one review workflow in the [AI-native CAD plan](https://github.com/barocss/cad/issues/322).

Use the existing local MCP proposal path with autonomy L1 on the D1467 upper R2 box. The tool discovers the original `n2.face` in the render legend and pins the Delete face command to revision `f255364bacdb5c62`. Studio shows the pending repair before it changes the working document. One user approval applies the edit.

## Verification

- **PASS, actual stdio MCP.** A direct command and agent approval refuse at L1. A stale revision also refuses and keeps the original bytes. The valid request creates one open proposal with native volume change 34.336 mm³. The original feature rows, outputs and summary stay.
- **PASS, actual desktop Studio.** Preview shows the restored cap and 34.34 mm³ change. Show before and Hide recover the correct original view with the pending document intact. One user approval retains the Fillet step and adds one Delete face with the exact R2 signature. The strict solid has the six stock face IDs and original sharp edge. Native volume changes from 11965.663706 to 12000 mm³. Undo restores the pending R2 source and Redo restores the accepted repair. Save and fresh Open rebuild the same native body. Local MCP reads the saved geometry and approval. The original input and pending files keep their bytes. The final receipt records zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 29 Model and 21 Studio proposal and MCP tests, browser driver syntax and diff checks. The first harness used the wrong module path. The second compared the viewport's faceted mesh volume with the native volume. The final driver checks viewport switching separately from the native calculation and proposal card.
- **NOT_RUN.** Live provider output, multi-agent scheduling, full local suites, actual WebGL2, mobile, STEP and a dedicated local production rebuild for this test-only change. #17 stays open.

Use Node 22.19.0 and the existing local Chrome and Playwright. Use the D1467 `top-fillet.bcad` witness. Keep evidence outside Git, run the browser and test groups under the shared gate and freeze worktree writes during the browser run.

```sh
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs proposal-history-focus proposal-review-availability toolset-mcp tool-contract-mcp
node --check apps/cad-studio/test/delete-face-agent-proposal-browser.mjs
cd apps/cad-studio
DELETE_FACE_PROPOSAL_FROZEN=1 node test/delete-face-agent-proposal-browser.mjs "$EVIDENCE/studio-agent-proposal" "$EVIDENCE/top-fillet.bcad"
```

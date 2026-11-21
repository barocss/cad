# D1472 — Review a fresh repair against the edited R3 source

P5, row 31 and agent review, [#17](https://github.com/barocss/cad/issues/17). Base: `afb77256ffbcd8ad87bd81abd1717512368d684f`.

Continue from the stale proposal case. Keep P1 pinned to the original R2 revision `f255364bacdb5c62`. After the Studio radius edit, read the same native face on the current R3 revision `4b5db6e4016340fb` and create a separate P2 through local MCP L1. The user reviews and approves P2 in Studio.

## Verification

- **PASS, actual stdio MCP.** The edited R3 input keeps 11922.743339 mm³ by the independent volume `12000 − 40 × 9 × (1 − π/4)`. P1 remains open and stale. P2 is open at the current revision and has a native change of +77.257 mm³. The original geometry and old proposal remain exact.
- **PASS, actual desktop Studio.** P1 offers no approval. P2 preview shows +77.26 mm³ and leaves the R3 working document intact. One user approval records P2 and adds one Delete face with the exact R3 signature for `n2.face`. The native result is a strict 12000 mm³ box with all six surviving face IDs and the original sharp edge. P1's entry stays open and stale. Undo and Redo restore the expected proposal states. Save and fresh Open preserve the result and decision, which local MCP reads back. The R2 input and both pending files keep their original bytes.
- **PASS, affected checks.** 29 Model and 25 Studio tests, browser driver syntax and diff check. The D1471 notice recovery runs as an actual desktop control after the shared test flow changes. Both final receipts report zero page errors, console errors and watched source changes.
- **NOT_RUN.** Live provider output, parallel agent execution, full local suites, actual WebGL2, mobile, STEP and a dedicated local production rebuild for this test-only change. #17 stays open.

Use Node 22.19.0, existing Chrome and Playwright and the D1467 upper R2 fixture. Use the shared gate, freeze worktree writes during desktop runs and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset tool-contract
node apps/cad-studio/scripts/test.mjs proposal-history-focus proposal-review-availability drawing-notice-lifecycle toolset-mcp tool-contract-mcp
node --check apps/cad-studio/test/delete-face-agent-proposal-browser.mjs
cd apps/cad-studio
DELETE_FACE_PROPOSAL_FROZEN=1 node test/delete-face-agent-proposal-browser.mjs "$EVIDENCE/studio-current-r3" "$EVIDENCE/top-fillet.bcad" --fresh-on-r3
DELETE_FACE_PROPOSAL_FROZEN=1 node test/delete-face-agent-proposal-browser.mjs "$EVIDENCE/studio-notice-control" "$EVIDENCE/top-fillet.bcad" --notice-ownership
```

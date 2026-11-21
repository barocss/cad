# D1536 — Pin an Agent drafted-wall distance edit to the reviewed revision

P5, row 31, [#629](https://github.com/barocss/cad/issues/629) and [#324](https://github.com/barocss/cad/issues/324). Base `888a8d53e08f2061373eb4c575c6797c1a06cca2`.

For the supported terminal right wall of an ordinary rectangular taper, local Agent discovery reports the current signed distance. Send only `values.offsetDistance` in mm and an `expectedRevision` from the current root part. The edit uses the saved History Offset command and the current native right wall handle evidence. The L1 path requires a proposal and Studio approval.

- **PASS, actual local MCP.** Saved +3 and +4 mm forms of the same wall have distinct visual revisions `b4e35f8ec0220840` and `ad21e997e0adab0d`. The rendered PNGs match their reported SHA-256 hashes. L1 direct edit, L1 direct approval, missing and stale pins, extra field, zero and the collapsing −40 mm candidate are refused. Byte checks pass before the valid pending proposal and after the refused approval. A Model test also checks no-op, nonfinite input, a replacement node mixed with a distance and an unsupported cap.
- **PASS, actual desktop Studio.** Open the pending +4 mm proposal, preview the −2 mm result and click Accept. The displayed volume change is −1720.34 mm³. Preview keeps the base document exact until approval, and the approval record names the user. Only the authored distance changes in the feature nodes. Undo restores +4 mm. Redo, native Save and fresh Open restore −2 mm. The reopened History field reads −2 mm.
- **PASS, independent native and displayed body reads.** A 40 × 30 × 10 mm stock at 10° draft keeps a strict closed solid, six faces, 12 edges, eight vertices and all native topology IDs. The expected right-plane displacement from +4 to −2 mm is −6 mm along its outward unit normal. All eight corner and six plane checks use 1e-9 mm tolerance. The five other supports stay fixed. Independent section integration gives 11954.059164696055 and 10233.719528464619 mm³. Both native and Studio volume reads agree within 1e-7 mm³. The native digest after fresh Open matches the approved result. No runtime, console or frozen-source changes occurred.
- **PASS, affected checks.** 80 Model and 25 Studio tests, scoped lint, Model types, Studio types and build, generated Agent inventory, browser syntax and Git diff.
- **FAIL, corrected test expectation.** The first focused run expected the collapse text “close a wall.” The existing native refusal says “close a section or cross the opposite wall.” The test now checks the actual native refusal and the unchanged document. The focused rerun passes.
- **NOT_RUN.** Full local suites, other renderers, mobile, live external Agent sessions and broader face-edit profiles. Both issues remain open.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and retain receipts and screenshots outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs offset-face-native native-offset-face revision-pinned-command tool-contract toolset proposals
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability history-feature-apply
pnpm exec eslint packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/src/chat/toolDefinitions.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/saved-wall-agent-browser.mjs
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/saved-wall-agent-browser.mjs
git diff --check
SAVED_WALL_AGENT_FROZEN=1 node apps/cad-studio/test/saved-wall-agent-browser.mjs "$EVIDENCE" "$D1535/saved-wall-before-edit.bcad" "$D1533/saved-wall-after-drag.bcad"
```

# D1740 — Extract Align and Revolve History reference actions from Studio App

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `a740f0fe61d55b700c0931ed499aab0797a1b59f`.

Move the Align target reader and Revolve axis replacement startup to `useHistoryReferenceActions`. App supplies the authored and command documents, live ownership references, worker revision and editor actions. The reader keeps the current target on a hidden body and omits its other faces. Revolve keeps its prefix read and requires the exact earlier stock body for a joined feature. App.tsx decreases from 3,195 to 3,149 lines.

- **PASS, before and after in desktop Chrome / WebGPU.** All 14 recorded Studio states, eight native oracle records and three saved file hashes match. The Align control hides a long-named target, retains its selected face in History, replaces it with the visible body and reopens the saved result. The standalone Revolve control refuses an edge from a later feature, previews a valid earlier axis, cancels and then replaces it. The joined Revolve control refuses a generated edge, recovers the original consumed stock edge, previews, cancels, replaces and reopens. The accepted documents, selections, history, notices, and measured bodies match.
- **PASS, affected checks.** 20 Model and 47 Studio tests, scoped ESLint, Studio production build and types, and Git diff check. The six desktop runs have zero source changes, page errors or console errors.
- **FAIL, recovered test selection.** The first Studio unit-test filter found no files. The focused rerun covers reference picking, History editor, History Apply and the command queue.
- **NOT_RUN.** New feature families, injected late worker replies, full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Run the three desktop commands on the base and candidate with Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external evidence directories. Compare the receipts' states, observations and saved file hashes.

```sh
D1199_SOURCE_FROZEN=1 node apps/cad-studio/test/align-retarget-preview-browser.mjs "$OUT/align" --retained-target
D1164_SOURCE_FROZEN=1 node apps/cad-studio/test/revolve-history-axis-browser.mjs "$OUT/revolve"
D1166_SOURCE_FROZEN=1 node apps/cad-studio/test/revolve-joined-history-browser.mjs "$OUT/joined"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test align revolve-axis
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test command-reference-picking history-feature-editor history-feature-apply command-apply-queue
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/useHistoryReferenceActions.ts}
pnpm --dir apps/cad-studio build
git diff --check
```

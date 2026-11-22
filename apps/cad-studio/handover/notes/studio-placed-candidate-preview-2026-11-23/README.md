# D1749 — Extract placed candidate preview from Studio App

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `b199ab5a5946a2a366482967413e35a3d5002a9a`.

Move the placed candidate's view ownership, dismissal, review retry and viewport body substitution into `usePlacedCandidatePreview`. App still provides the Versions and dock state, current model scope and live occurrence lists. App.tsx goes from 3,149 to 3,132 lines.

- **PASS, desktop Studio before and after.** Four Chrome WebGPU runs cover candidate preview, accepted model restoration, panel collapse, isolation, stale document Open, stale terminal review and final checkpoint approval. The paired preview and decision flows match eight Studio states and two independent geometry results. The candidate raises only the base from 5 to 6 mm. Its volume rises from 1,000 to 1,200 mm³. The sibling retains its 3 mm height. The project bytes and worker store remain fixed during review. Exactly one valid terminal approval produces the reopened native result.
- **PASS, comparison custody.** Documents, selections, history, notices, and observations match after accounting for the generated worker run IDs, run record and receipt hashes, and the four approval timestamps in the final document. Verify each approved native file against its own SHA-256 and assert the Studio notice displays that hash. The accepted document differs solely in those timestamps. The working native baseline SHA-256 matches. No page errors, console errors, source changes or downloads occur.
- **PASS, affected checks.** 28 Studio tests, scoped ESLint, Studio TypeScript and production build, and Git diff check.
- **FAIL.** None.
- **NOT_RUN.** Full local suites, alternate GPU backends, mobile and live model providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Run both desktop commands on the base and candidate with Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external evidence directories.

```sh
D613_SOURCE_FROZEN=1 node apps/cad-studio/test/task-candidate-review-browser.mjs "$OUT/preview"
D614_SOURCE_FROZEN=1 node apps/cad-studio/test/task-candidate-review-browser.mjs "$OUT/decision" --decision
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test task-candidate-image task-run-candidate-render task-run-review task-run-studio candidate-atomicity instance-evaluation
pnpm exec eslint apps/cad-studio/src/{App.tsx,viewport/usePlacedCandidatePreview.ts}
pnpm --dir apps/cad-studio build
git diff --check
```

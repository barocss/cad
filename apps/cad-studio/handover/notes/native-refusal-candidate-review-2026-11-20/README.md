# Retire a worker review after a recorded native refusal

[Issue #324](https://github.com/barocss/cad/issues/324), revision-bound visual review.

Desktop Studio reproduced a misleading state. The candidate had passed its earlier checks and displayed a four-view image. Its approval was subsequently refused with HTTP 409 and `TASK_NATIVE_GATE`. The accepted model and commit count stayed intact, but Studio continued to label the old image current and the height check Pass.

The service now marks a refusal recorded against the exact decision operation with `reviewRequired`. A repeated submission of that receipt returns the recorded outcome. Studio retires the matching preview, image and decision controls, restores the accepted view and directs the user to review the pending attempt again. An older reply cannot retire a newer review. The existing eligibility checks still apply to the new receipt.

## Verification

| Check | Result |
| --- | --- |
| Native FAIL on a protected occurrence | With the candidate geometry unchanged, a controlled native evaluation returned a real 3 mm sibling against the 4 mm requirement. The native check measured 3 and failed. Both image regeneration and approval were refused. |
| Native UNKNOWN on a protected occurrence | A controlled native evaluation returned a solid without the measured bore. The diameter check returned unknown and the requirement evidence reported unsupported. Both image regeneration and approval were refused. |
| Native recovery | In both cases, the accepted bytes, commit count and candidate identity survived refusal. Restoring the normal evaluator reproduced the original PNG digest. A fresh decision approved the same candidate once. |
| Before the UI fix | The actual desktop review remained visible after the recorded native refusal, with one current image and a passing height label. The regression failed waiting for the review to close. |
| After the UI fix | The same pending Base edit, 5 → 6 mm, lost its old preview, pass label, image and decision controls on refusal. The accepted file bytes stayed identical and publication count stayed at zero. The next review had a newer receipt revision. Rendering and approving it through the normal services created one checkpoint. |

The desktop test controlled the evaluator input for one approval. It evaluated an actual zero-height extrusion and obtained the host's native refusal. It then let the original browser request reach the normal HTTP server with the same receipt and verified the recorded refusal was returned. The healthy retry used the normal evaluator. The protected height and bore verdicts above were exercised in the host and renderer tests. No paid model participated.

Run each command under the heavy gate from the repository root. For the Studio flow, supply the installed desktop Chrome and Playwright through CHROME and PW_DIR. Use a fresh external STUDIO_OUT and keep the checkout frozen during the run.

```sh
pnpm --filter @barocss/cad-studio-app test task-run-candidate-render task-run-cli.test task-candidate-image
pnpm --filter @barocss/cad-studio-app build
(cd apps/cad-studio && CANDIDATE_RENDER_SOURCE_FROZEN=1 node test/task-plan-agent-browser.mjs "$STUDIO_OUT" --candidate-render)
```

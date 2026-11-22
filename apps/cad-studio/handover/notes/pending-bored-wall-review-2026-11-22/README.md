# D1669 — Review the native bore before approving a wall edit

P5, row 31. [#322](https://github.com/barocss/cad/issues/322) and [#324](https://github.com/barocss/cad/issues/324). Base `e0822168de5ea84d7ce2d19baf123a34fd570307`.

For the last outer-wall Offset of the D1668 radial through bore, `proposals.list` returns a `modelReviewRevision`. Use it as `expectedProposalRevision` with the proposal ID and the current part's `expectedRevision` in `query.render`. The reply returns the candidate model revision, image hash and `candidate.reviewRevision`. Pass the same base and proposal arguments plus `expectedReviewRevision` to `query.inspect`. The inspection reports analytic faces, bore diameter and the two native opening loops with their edge IDs. Review does not change the working model, History or approval. The existing Direct review inputs retain their behavior.

- **FAIL, base.** The local MCP listed a current D1668 proposal without a model review pin. Render and inspect sent the model path to the Direct input refusal. The focused Model test failed discovery.
- **PASS, affected checks.** 30 Model and 17 Studio tests with zero failures or skips, type checks, scoped lint, driver syntax, Studio production build and Git diff check. Tests refuse missing image pins, changed base or proposal pins, wrong proposal IDs and accepted candidates. Two proposals with identical geometry produce the same PNG but distinct review revisions. Swapping their image pins is refused. Direct candidate render and inspect remain covered.
- **PASS, actual desktop Studio WebGPU and local MCP.** Both stock edit orders pass. Before approval, local MCP reads outer R13 and inner R8 mm, the two Ø3 mm bore faces and both original openings. Each opening has eight native edges with reciprocal connections to the bore faces. The accepted base remains R11 mm during review. A correct pin for an older proposal still refuses after donor motion. Studio preview, explicit approval, Undo, Redo and native Save and fresh Open pass. The reopened exact B-rep matches the reviewed body hash `70c38369c25d78ab6a88f8062e226956cbd664b2eecf3fedd56fbdb9f4a7e33c`, genus one and volume 1382.097360255641 mm³. Its native faces and the PNG bytes equal the pending review. The PNG SHA-256 is `ece2d5d4a52f6b60046f7ee377e5fb0402989170966e939631cb9da253a33a5b` for both orders. The browser recorded eight checkpoints, 1,179 frozen files per run and zero worktree changes or page or console errors.
- **NOT_RUN.** Full local suites, WebGL2, mobile, neutral-file exchange, provider benchmark and paid Agent service. The review reports bore geometry. The existing WALL-4 material requirement remains unknown for this bored profile. The broader issues remain open.

Use Node 22.19.0, the heavy gate and installed Chrome and Playwright (`CHROME`, `PW_DIR`). The two input documents are the saved D1668 current pending proposal variants. Keep the worktree frozen during desktop runs and evidence outside Git.

```sh
pnpm exec eslint packages/barocss-cad-model/src/{chat/groups,chat/part/modelCandidate,chat/part/proposals,chat/part/views,chat/modelProposalReview,chat/toolDefinitions,engine/doc}.ts packages/barocss-cad-model/test/replace-face.test.ts apps/cad-studio/test/bored-wall-candidate-review-browser.mjs
node --check apps/cad-studio/test/bored-wall-candidate-review-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face agent-direct-ruled-proposal agent-direct-thicken-proposal agent-direct-thicken-visual-review proposals
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir apps/cad-studio build
for order in replace-first wall-first; do
  D1669_SOURCE_FROZEN=1 node apps/cad-studio/test/bored-wall-candidate-review-browser.mjs \
    "$OUT/$order" "$D1668/$order/pending-current-donor.bcad"
done
git diff --check
```

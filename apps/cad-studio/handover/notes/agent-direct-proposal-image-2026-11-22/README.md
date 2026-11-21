# D1627 — Review a pending Direct Ruled proposal as an image

P5, row 24, [#324](https://github.com/barocss/cad/issues/324) and [#322](https://github.com/barocss/cad/issues/322). Base `2df639263dff242827fcf86adeaba6629f2fbc29`.

Read `direct_revision` from `query.summary` and the open proposal's `directReviewRevision` from `proposals.list`. Pass `expectedDirectRevision`, `proposal` and `expectedProposalRevision` to `query.render`. The existing Studio proposal replay evaluates a private copy and the Direct renderer produces its four-view PNG. The result identifies the geometry used for the image with `revision` and identifies the source and proposal in `candidate`. The document and proposal remain open for a Studio decision.

- **PASS, local MCP and desktop Studio WebGPU.** The current 27,247-byte image shows two rails, while the private 30,433-byte image shows a third Direct object, the same Ruled sheet visible in the Studio preview. The MCP reads preserve the original file bytes. The Studio preview keeps two authored objects before approval.
- **PASS, stale and decided proposals.** Hiding one rail in Studio clears the preview and disables the Preview button. The old source pin and the current source pin with a stale proposal both return refusals with zero image blocks. The Model regression also refuses a changed proposal at the same ID on the same base. A decided proposal has no candidate image.
- **PASS, approved result.** Undo the visibility edit, then approve in Studio and Save. A fresh Open preserves the accepted document. The reopened local Agent image matches the candidate byte for byte and retains its geometry revision and Direct object IDs. Both images have SHA-256 `616a62364e4e4e4ff0d05b814df809db050f4a0e1e68576ecfb2012079ac09da`. The browser froze 632 files with zero changes, page errors and console errors.
- **PASS, affected checks.** Model 24, Model type check, scoped ESLint, generated Agent docs, Studio build, browser syntax and Git diff. The 13-tool contract stays within 24,899 of 25,000 characters per turn.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Mixed solid and Direct proposals, WebGL2 product run, paid live model and full local suites. Both issues remain open.

Use Node 22.19.0, the existing Chrome and Playwright, one heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-ruled-proposal views toolset tool-contract
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-proposal-agent-visual-review-browser.mjs
pnpm --dir apps/cad-studio build
D1627_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-proposal-agent-visual-review-browser.mjs "$OUT"
cmp "$OUT/02-mcp-candidate.png" "$OUT/08-mcp-accepted.png"
git diff --check
```

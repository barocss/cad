# D1668 — Approve a reviewed outer-wall Offset on a bored Exact semicylinder

P5, row 31. [#322](https://github.com/barocss/cad/issues/322), [#324](https://github.com/barocss/cad/issues/324) and [#629](https://github.com/barocss/cad/issues/629). Base `aca38dcdd0bf20ccdef378e7964db80502469be8`.

The local Agent can propose a signed edit to the last outer-wall Offset of the D1666 radial through bore. Use the existing `features.edit` action with one `values.offsetDistance` and an `expectedRevision` from `query.render` or `query.rebuild`. Discovery and edit use the same check. It binds the current two displayed owners to the document and checks the matching native edit, its certified Difference and the linked donor. The D1666 kernel checks both openings and keeps the original bore incidence. Proposal preview and user approval replay the same edit.

- **FAIL, base.** For both stock edit orders, the local MCP found no editable key and refused a current +1 mm proposal with the saved wall at −1 mm. The source bytes stayed equal. The focused Model regression failed at discovery.
- **PASS, affected checks.** 61 Model and 21 Studio tests, type checks, scoped lint, browser driver syntax, Studio production build and Git diff check. Coverage includes stale same-ID display bodies, repeated owners, invalid current geometry, suppressed, rematched and continued features, the wrong face and incorrect pins. The signed +3 mm edit reports the loss of one opening in the direct tool detail. The proposal reports a refused rebuild and keeps the accepted file.
- **PASS, actual desktop Studio WebGPU and local MCP.** Both edit orders pass nine captured checkpoints. The first PNG hash and 16-digit revision qualify the original proposal. Moving the linked donor down 1 mm changes the image and revision. Studio disables the old Preview and Accept, and refuses Rebase & preview. Local MCP refuses the stale pin, a +3 mm blind result and L1 self-approval. The new preview shows a +601.95 mm³ change while the accepted part remains at 780.1504813557582 mm³. Studio approval records the user and applies +1 mm. Undo, Redo, native Save, fresh Open and reopening the editable Offset pass.
- **PASS, native geometry.** The two orders match the D1666 manual edit exactly. On Open the outer radius is 13 mm, the inner radius is 8 mm, and both openings of the 3 mm bore remain. The exact volume is 1382.097360255641 mm³ and the donor and bore incidence match the pre-approval owners. Each run froze 1,178 files with zero file changes, page errors or console errors.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid agent providers. The existing bore wall requirement is still unknown. A focused approval check refuses a proposal that explicitly depends on that unmeasured WALL-4 requirement. The accepted workflow preserves its authored requirement and reports it as unknown. The three issues remain open for their broader work.

Use Node 22.19.0, the heavy gate and installed Chrome and Playwright (`CHROME`, `PW_DIR`). Keep the worktree frozen during desktop runs and keep the output outside Git. Use the corresponding signed inward and reopened manual documents from each D1666 flow.

```sh
pnpm exec eslint packages/barocss-cad-model/src/{app/nativeOffsetFace,engine/doc,chat/part/features,chat/toolDefinitions}.ts packages/barocss-cad-model/test/replace-face.test.ts apps/cad-studio/test/bored-wall-agent-proposal-browser.mjs
node --check apps/cad-studio/test/bored-wall-agent-proposal-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face offset-face-native offset-exact-cylinder-wall offset-exact-cylinder-cap agent-offset-wall
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-preview proposal-browser agent-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test proposal-review-availability proposal-history-focus
pnpm --dir apps/cad-studio build
for order in replace-first wall-first; do
  D1668_SOURCE_FROZEN=1 node apps/cad-studio/test/bored-wall-agent-proposal-browser.mjs \
    "$OUT/$order" "$D1666/$order/03-inward-doc.bcad" "$D1666/$order/07-opened-doc.bcad"
done
git diff --check
```

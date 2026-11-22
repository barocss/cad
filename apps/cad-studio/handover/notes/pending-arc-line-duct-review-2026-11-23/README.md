# D1752 — Review an arc-and-line rectangular duct in travel order

P1 Agent visual review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `e7c4519b6800b126b8c3feb9dccefd88adabab6b`.

Use the existing pending duct review on the arc-and-line part from [D1751](../exact-rectangular-arc-line-sweep-2026-11-23/README.md). Read the bend and straight face names in authored travel order. Verify the two cap loops, the curved cap chart and eight native tangent edges. The exact path, native body, standard PNG and opposite PNG use the existing revision and orientation pins.

- **FAIL, original capability.** Local MCP offers the pending proposal pin, then returns `MODEL_REVIEW_REPLAY_FAILED` for the arc-and-line duct. The desktop baseline creates the same native geometry and preserves the staged proposal bytes.
- **PASS, local Agent.** The Back view shows the curved inlet `n1.start`. Left shows the straight outlet `n1.end`. The named native end planes, four interior and four exterior seams, copied path revision and native body hash match the candidate. Wrong proposal, source path, image and orientation pins are refused. Two proposals with the same geometry share image bytes and have distinct review revisions.
- **PASS, actual desktop Studio WebGPU.** Preview, explicitly approve P1, Undo, Redo, Save and fresh Open. Native size, two open mouths, both face names and both Agent PNGs reproduce after Open. The reopened native volume is 662.6548245743669 mm³.
- **PASS, affected checks.** 39 Model tests, 17 Studio tests, scoped ESLint, Model types, Studio production build, browser driver syntax and Git diff check. Three passing desktop runs capture 48 states and zero page errors, console errors or source changes. The D1748 line-and-arc control matches both previous PNG hashes and its native body hash.
- **NOT_RUN.** Generalized duct review, full local suites, alternate GPU backends, mobile and live model providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #324 stays open.

| Measurement | Value |
| --- | --- |
| Copied Direct path SHA-256 | `a91a46c76340ad5e3b59637326ff49a0eda454128953fce01a4598de7a3bef9a` |
| Candidate part revision | `8f0abbefaddb36de` |
| Native body SHA-256 | `8d1f3c83bdfc01e07509c65851baa6ef57325febca5a03b450f13cf9c80f2d6b` |
| Standard image SHA-256 | `b9cdc2d336765852f7aa1cd090eff222ca31f0c238a7ba7d885ceb09a54e1186` |
| Opposite image SHA-256 | `ea4eea09186b164c14aed5612d570ec21a9db282d84aa99141c748ae9df43da1` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. On the base with the candidate driver, use `--arc-and-line --review --expect-review-refused`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-duct-proposal-review views saved-chamfer-resize-review corner-proposal-review sweep-agent-remap toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{rectangularDuctProposalReview,part/views}.ts \
  packages/barocss-cad-model/test/rectangular-duct-proposal-review.test.ts \
  apps/cad-studio/test/{duct-proposal-review-browser-steps,exact-rectangular-duct-sweep-browser}.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1752_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/arc-line" --arc-and-line --review --opposite-image
D1748_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/line-arc-control" --line-and-arc --review --opposite-image
git diff --check
```

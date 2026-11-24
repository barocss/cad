# D1882 — Pin the tilted paired outlet Agent review to its native result

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#324](https://github.com/barocss/cad/issues/324). Base `ee4437a7fb7c4247acbfefc68fcc038e26d5cbad`.

The local Agent could already propose the D1881 inward tilted replacement. This slice makes the specific five-feature document and its single native replacement eligible for the existing revision-pinned preview and inspection. The same replay checks original outlet and candidate face identity, the unchanged donor and both outlet apertures. It compares the native coedges and curves of all four original joins before issuing a pin. The normal and opposite images use one exact part digest. Proposal and image revisions continue to belong to the existing review path. The accepted geometry stays untouched until explicit Studio approval.

- **FAIL, unchanged product.** The local CLI proposed the exact valid replacement and produced a Studio proposal preview, but `proposals.list` returned no `modelReviewRevision`. A pinned image request returned `MODEL_REVIEW_UNAVAILABLE`.
- **PASS, actual local Agent and desktop Studio.** Both real image orientations use candidate digest `8e63840eb47ab4fd99e7f26bfc7620cf474ce4265bd98e432f9262d07200d46a`. Their image digests and review pins differ. Exact source and donor face inspection agrees in both. An orientation mismatch, a donor-face change in the proposal alone and a moved donor in the base part refuse the previous image pin. The local Agent cannot approve the change. Actual Studio hides approval when its base changes. Explicit user approval from the matching proposal and native Save/fresh Open preserve the exact reviewed geometry. The candidate retains both passage loops, 48 join edges and 2243.9644737231 mm³ of material. The independent difference is −32 mm³.
- **PASS, affected checks.** 38 Model tests, 2 Studio tests, scoped lint, Model types and Studio production build. The tilted workflow records eight desktop states. The existing parallel paired outlet review control records eight states. No browser page, console or frozen source errors occur. A Sol High review checked the proposal and image ownership and identified the proposal-only donor-face regression.
- **FAIL, first harness attempts.** The first browser inspector used incorrect package import paths. The first MCP build found two IDs imported from the document module instead of their existing owner. Both were corrected before the passing run.
- **NOT_RUN.** Whole local suites, natural-language provider, external cost and cross-client comparisons, other supported part families, other renderers and mobile. #324 retains its broader acceptance. First mechanical CAD stays 8/10.

## Reproduce the affected checks

Use Node 22.19.0 and existing Chrome and Playwright. Run one heavy job at a time and freeze the worktree during Studio.

```sh
pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-plane-proposal-review rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review corner-proposal-review paired-elbow-outlet-offset-handle
pnpm --dir apps/cad-studio test tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1882_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-tilted-outlet-agent-browser.mjs "$OUT/tilted"
D1856_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/parallel" --agent-review
```

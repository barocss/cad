# D1829 — Name the earlier rectangular cut in a local Agent proposal

P1 rows 15 and 16. [#25](https://github.com/barocss/cad/issues/25) remains open for the wider source and path cases. D1828 qualifies the manual Studio workflow. This milestone qualifies the existing named Agent command and local approval for the same bounded stock.

## Reproduction and decision

On base `113ec06e86f6fc2694010e559a0e2efa2efba20e`, the local level-one MCP describes the rectangular-cut fields without `source`. A dry run from the actual two-cut Studio document at revision `d11b5a0f417ce774` refuses the explicit `source: "n4"` with “has no value source.” The input bytes remain equal.

The command accepts one stable earlier feature ID when the request supplies the current document revision and one current solid body. The Model command validates that the feature is the direct earlier active Difference on the same stock. The native builder still checks the two rectangular through-cuts and the requested placement. The command response reports the source feature ID, target feature ID and selected body ID. An omitted source follows the current-cut command as before. The public tool envelope and document schema stay the same.

## Acceptance

- A local level-one dry run reports the 240 mm³ reduction and leaves the original bytes intact. Stale revision, current feature used as an explicit source, and a grid overlapping the later cut refuse atomically. Local MCP can stage the change and cannot accept it.
- Desktop Chrome WebGPU opens the pending proposal. Preview shows the volume delta while the two original openings and 23800 mm³ accepted body remain. Studio Accept records the user decision and adds one feature with source `n4` and target `n7`.
- The accepted and freshly opened native solids each have five openings at both caps. Strict topology and genus five pass. Volume is 23560 mm³. The centroid and every native aperture coordinate match the independent stock-minus-openings calculation within 1e-8. The later opening remains at [11, 27] mm. Save and fresh Open preserve both references and the approval record.

## Verification

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1829_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --agent
```

- **PASS.** 29 focused Model tests and 4 Studio tests, including the tool contract and the 24,994-character turn budget. Model and Studio type checks, scoped lint, Studio production build, driver syntax and Git diff check pass. Six actual Chrome checkpoints pass. All 1,206 frozen inputs match after cleanup. Zero page errors, console errors or watched source changes.
- **FAIL — corrected verification.** The first test used internal command selection where the Agent state expects stable names. The first browser driver required native overlap detail from the batch message. Batch reports the refusing operation and the generic kernel message. The revised check verifies that refusal and byte retention. Both final checks pass.
- **NOT_RUN.** Full local suites, mobile, other backends, external providers and tests for other earlier-source pattern families. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

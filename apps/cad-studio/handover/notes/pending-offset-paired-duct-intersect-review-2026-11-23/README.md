# D1777 — Review four apertures on a pending offset two-cavity Intersect

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `f9c449feacc23339474865a10cca958033c7f9a2`.

Extend the existing paired-cavity Intersect review from the centered cut to the D1776 positive-offset cut. Use the actual cylinder-plane intersections for aperture width, use the authored cavity wall tags for ownership and verify the measured cap and cylinder angles. Keep the same image pin and explicit Studio approval path.

- **FAIL, original capability.** Studio can preview, approve, save and reopen the valid x = 1 mm cut. The pending proposal has no model review revision. Agent render returns `MODEL_REVIEW_UNAVAILABLE`.
- **PASS, local Agent.** Each of the two reported planar caps is at x = 1 mm and has two distinct apertures. Each rim identifies its four cavity walls and four native edges. The two image orientations share the same native body and give distinct image revision pins. Pinned native inspection reads both cap planes. Stale base, proposal and image pins are refused. Review preserves the pending file bytes.
- **PASS, actual desktop Studio WebGPU.** Four aperture rays and two material rays match the cap evidence. Preview and explicitly Accept. Save and fresh Open reproduce the approved body, both native cap planes and both PNG byte strings. The three baseline/candidate native records are byte identical.
- **PASS, independent geometry.** The cap exterior width is 4.00506022022448 mm. The four aperture widths are 2.00251100239275 mm, the heights are 2 mm and the signed areas are about −4.00502200478551 mm². Material area is 32.0405581926738 mm² per cap. The twelve native cap-cylinder angles are 86.815261°, 87.270597°, 92.605251° or 93.016961°. All 36 joints and 72 parameter curves are verified. Segment integration gives 1,946.5922803764431 mm³. Native quadrature gives 1,946.5922803764392 mm³. The maximum native chart gap is 3.421e−14 mm.
- **PASS, affected checks and controls.** 55 Model and 17 Studio tests, scoped ESLint, Model types, Studio build with types, driver syntax and Git diff check. 36 desktop checkpoints have zero source, page or console errors. D1774 centered paired and D1769 single offset body hashes, native evidence and both PNG byte strings match. Native fixtures also verify x = 2 and x = 15 mm, independent cavity sizes and source order, reversed travel and swapped operands.
- **FAIL, recovered fixtures.** Early fixture checks corrected the world Z sign, used numeric comparison for floating-point bounds, normalized source fragment names before an orientation mutation and provided a type annotation for a test variable.
- **NOT_RUN.** Full local suites, a different cutter family, follow-on Fillet, general rendering, alternate GPU backends, mobile and live providers. Issue #324 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Check | Value |
| --- | --- |
| Candidate part revision | `8afff670b81f9469` |
| Native body SHA-256 | `8d28196c3cf3fb19803e933be75e331f8e91d84e25e35c06266f7de6213a6132` |
| Standard PNG SHA-256 | `b514b9c12bad0ed293c34973a07b3d75451fb6da1bc0a0ef632d2c634bb714a3` |
| Opposite PNG SHA-256 | `fefc68c1859a80afe33e71259a03349c3570446743334c9573f0cdca675dde6f` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1777_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --paired-cavities --offset --expect-cut-review-unavailable
D1777_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/verified" --paired-cavities --offset --review-cut
D1774_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/centered-pair-control" --paired-cavities --review-cut
D1769_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/single-offset-control" --review-cut
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-rectangular-duct-intersection-evidence offset-rectangular-duct-intersection-evidence closed-paired-rectangular-duct-evidence rectangular-duct-intersection-proposal-review rectangular-duct-proposal-review views toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{pairedRectangularDuctIntersectionEvidence,rectangularDuctIntersectionProposalReview,part/views}.ts packages/barocss-cad-model/test/{paired-rectangular-duct-intersection-evidence,rectangular-duct-intersection-proposal-review}.test.ts apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
git diff --check
```

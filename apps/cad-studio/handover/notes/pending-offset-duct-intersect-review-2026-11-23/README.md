# D1769 — Review native apertures on a pending offset duct Intersect

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `1f15a081a87d201cf79e988122740b15f65d8a24`.

Use the existing Agent image review for one pending Intersect of the D1767 rectangular duct and its covering box. Rebuild the owned exact closed source, certify the box and check the single pending result. Pin both native cap apertures, signed loop areas and material volume to the same candidate body and each image orientation.

- **FAIL, original capability.** Local MCP stages the valid x = 1 mm Intersect. The proposal has no model review revision and image review returns `MODEL_REVIEW_UNAVAILABLE`. The existing Studio preview and explicit approval still produce the valid cut.
- **PASS, local Agent.** Both cap names and measured apertures share the candidate B-rep hash across standard and opposite views. Native inspection uses the exact corresponding review revision. Stale base, proposal and orientation pins fail. Read-only review preserves the staged proposal bytes.
- **PASS, actual desktop Studio WebGPU.** The cap material and cavity rays agree with the native cut. Preview the pending result and explicitly Accept. Save and fresh Open reproduce the native body, both analytic plane facts and both PNG byte strings. The prior closed-duct review control also reproduces both images and its native record byte for byte.
- **PASS, independent geometry.** Both actual outer cap widths are about 4.00506022022448 mm and both aperture widths are about 2.00251100239275 mm. Outer height is 6 mm and aperture height is 4 mm. Both loops bind four exact rim edges to their proper walls. The material area is about 16.02031731177584 mm² per cap. All 48 charts and 24 signed joint measurements pass. Independent segment-area integration gives 973.2961147758438 mm³. Native quadrature gives 973.29611477584 mm³. Maximum chart gap is 3.420e−14 mm.
- **PASS, affected checks.** 51 Model and 17 Studio tests, scoped ESLint, Model types, Studio production build, driver syntax and Git diff check. Three passing desktop runs record 30 checkpoints with zero source, page or console errors.
- **FAIL, recovered fixture.** The first negative test assumed that reversing the connected cavity walls would leave strict topology valid. The final test verifies rejection and keeps the independent normal check.
- **Observed desktop selection.** The first cap click in the candidate run selected an adjacent curved wall. The second cap click selected a planar cap. Both surface ray pairs and both pinned native cap inspections passed. General Rendering remains held in #608.
- **NOT_RUN.** Full local suites, arbitrary cutter shapes, other model families, live providers, mobile and alternate GPU backends. Issue #324 stays open. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

| Check | Value |
| --- | --- |
| Candidate part revision | `e21781835b0d50a2` |
| Native body SHA-256 | `8b3e9b605bc365439a7aaa655f3430d2ee475a02175f29b179a6b51d76ac5b5e` |
| Standard image SHA-256 | `933f662437e9f9011c6874ba999e6593c1946f6fa5951e70769d23d871eae067` |
| Opposite image SHA-256 | `b2812adfded0de97ae8943999438dfa3e9909732d36ec7157b1b689196a35a5e` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1769_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --expect-cut-review-unavailable
D1769_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/verified" --review-cut
D1763_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/control" --review-cavity
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-rectangular-duct-intersection-evidence closed-rectangular-duct-evidence
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-duct-intersection-proposal-review rectangular-duct-proposal-review
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test views saved-chamfer-resize-review corner-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{offsetRectangularDuctIntersectionEvidence,rectangularDuctIntersectionProposalReview,rectangularDuctProposalReview,part/modelCandidate,part/proposals,part/views}.ts   packages/barocss-cad-model/test/{offset-rectangular-duct-intersection-evidence,rectangular-duct-intersection-proposal-review}.test.ts   apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
git diff --check
```

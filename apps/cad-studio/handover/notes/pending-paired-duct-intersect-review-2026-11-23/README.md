# D1774 — Review four apertures on a pending two-cavity Intersect

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `1cf28572d4595109264fee2e5f37d4d29b15b376`.

Extend the pending rectangular duct Intersect review to the D1773 centered covering-box cut. Verify the exact paired Sweep source and the before/after feature history. Bind each native cap and its two aperture rims to the corresponding source cavity walls, dimensions and signed area. Use the existing image revision and explicit Studio approval workflow.

- **FAIL, original capability.** The valid centered cut can be approved, saved and opened in Studio. The pending proposal has no model review revision. Local MCP image review returns `MODEL_REVIEW_UNAVAILABLE`.
- **PASS, local Agent.** The native cap names are `n3.side3#1` and `n3.side3#2`. Each cap has two unique aperture rims with distinct native edges and the correct four cavity wall names. Each aperture is 2 × 2 mm. Signed rim areas are +40, −4 and −4 mm², with 32 mm² of material per cap. The two image orientations share a native body hash and have distinct image revision pins. Native inspection through either pin reproduces both cap planes. Stale base, proposal or image pins are refused. Read-only review preserves the pending document bytes.
- **PASS, actual desktop Studio WebGPU.** The cap and aperture rays distinguish the four openings from the central web. Preview and explicitly Accept. Save and fresh Open reproduce both native cap planes, the native body and both Agent PNGs byte for byte. Three candidate native records also match the base exactly.
- **PASS, independent geometry.** All 36 exact native joints, including 24 distinct rim edges, are verified. Maximum chart gap is 2.864e−14 mm. Independent half-annulus integration gives 2,010.6192982974676 mm³ and centroid X 12.782794512664058 mm. Native quadrature gives 2,010.6192982974717 mm³ and centroid X 12.78279451266401 mm. Unequal cavity widths and heights, reordered cavities, reversed travel and swapped operands preserve ownership and signed position in focused fixtures.
- **PASS, affected checks and controls.** 51 Model and 17 Studio tests, scoped ESLint, Model types, Studio build with types, driver syntax and Git diff check. 27 desktop checkpoints have zero source, page or console errors. D1769 retains its native body hash, aperture data and both image hashes.
- **FAIL, recovered fixture.** The first new native test run expected exact equality for floating-point rim dimensions and used the opposite centroid sign in the reversed-travel fixture. Corrected the expectations and reran the checks.
- **NOT_RUN.** Full local suites, other cutting scopes, alternate GPU backends, mobile and live providers. Issue #324 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Check | Value |
| --- | --- |
| Candidate part revision | `e4be1f657de51229` |
| Native body SHA-256 | `6f4b9363ead21fbb8c449f26d6a6ed2538f05fc7808ab43bfa6f9a53d6d78018` |
| Standard PNG SHA-256 | `866514a7cdbdd73656121213f3b2bbccdb49cb8fdf7a1b7e90d0b9da539442fe` |
| Opposite PNG SHA-256 | `a39ffda8baff37a73157f065045d73ede85334eeb61a750045c42adf9fc816b5` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1774_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/base" --paired-cavities --expect-cut-review-unavailable
D1774_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/verified" --paired-cavities --review-cut
D1769_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs "$OUT/offset-control" --review-cut
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-rectangular-duct-intersection-evidence offset-rectangular-duct-intersection-evidence closed-paired-rectangular-duct-evidence rectangular-duct-intersection-proposal-review rectangular-duct-proposal-review views toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{pairedRectangularDuctIntersectionEvidence,rectangularDuctIntersectionProposalReview,rectangularDuctProposalReview,part/modelCandidate,part/views}.ts packages/barocss-cad-model/test/{paired-rectangular-duct-intersection-evidence,rectangular-duct-intersection-proposal-review}.test.ts apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-intersection-browser.mjs
git diff --check
```

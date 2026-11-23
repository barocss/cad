# D1780 — Review a pending resize of two saved Sketch Chamfers

P1 Agent review, rows 09 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `a631fb788d1b10c9ac849fc748611ca6c8249367`.

Extend the saved Chamfer review to two distinct saved bevels that share an original straight carrier. Replay the existing group edit on a copy. Verify both original and resized native setbacks, carrier planes and any retained saved neighbors. Preserve proposal input order in the grouped review and use the existing approval workflow.

- **FAIL, original capability.** Studio previews, approves, saves and reopens the valid D8 grouped resize. The Agent does not receive a model review revision. Query render returns `MODEL_REVIEW_UNAVAILABLE`.
- **PASS, local Agent.** The two native bevels `n1.side[e6]` and `n1.side[e7]` are measured from 6 to 8 mm on their own carriers. The three original carrier planes match the candidate. Both four-view images share the body hash and use distinct review revision pins. Pinned native inspection verifies both bevel planes and the three carriers. Stale base, proposal and image pins are refused. Read-only review preserves the staged file bytes.
- **PASS, actual desktop Studio WebGPU.** Preview and explicitly Accept the grouped D8 edit. Save and fresh Open reproduce the approved body, the five inspected planes and both Agent PNGs. The manual resize, reopened part and Agent approval agree. Five baseline/candidate native inspector records match byte for byte.
- **PASS, independent geometry.** Both bevels keep their right and oblique carrier normals. The common straight carrier retains 14 mm, and the 10 mm extrusion measures 20,488 mm³. The independent comparison uses the original and current native carrier planes and the four setback seam endpoints per bevel. Focused fixtures cover both input orders, a selected bevel already at the requested size, a retained adjacent bevel, and refused stale, invalid or nonadjacent selections.
- **PASS, affected checks and controls.** 60 Model and 17 Studio tests, scoped ESLint, Model types, Studio build with types, driver syntax and Git diff check. 27 desktop checkpoints report zero source, page or console errors. The legacy single-bevel JSON stays exact. D1702 retains its native body, evidence and four-view PNG.
- **FAIL, recovered fixture and types.** A new fixture expected a loop profile where the exact document uses a polygon. The first type check also exposed an ambiguous selector union and deliberate invalid-input test calls that needed type annotations. Corrected the fixture and typing and reran the checks.
- **NOT_RUN.** Full local suites, arbitrary group sizes, a moved implicit sketch anchor, alternate GPU backends, mobile and live providers. Issue #324 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Check | Value |
| --- | --- |
| Candidate part revision | `0a48b6116ba0a01a` |
| Native body SHA-256 | `82d6d8538085e3a22ed5de24387a49b95dc050212b6a150b150047c1eed81c58` |
| Standard PNG SHA-256 | `61dcd79b41311fc756b2bafa3281826175855a9e4c4ad939c8b62562394a8396` |
| Opposite PNG SHA-256 | `ef63d2e8d0ae1fac2f819645145ad76116dbf15be762f78d4ba01b3db9874372` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1780_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs "$OUT/base" --expect-review-unavailable
D1780_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs "$OUT/verified" --review-pair
D1702_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/single-control" --review-resize
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test saved-chamfer-resize-review corner-proposal-review saved-chamfer-agent-edit sketch-chamfer-edit sketch-chamfer-retention views toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/cornerProposalReview.ts packages/barocss-cad-model/test/saved-chamfer-resize-review.test.ts apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-adjacent-oblique-chamfer-resize-browser.mjs
git diff --check
```

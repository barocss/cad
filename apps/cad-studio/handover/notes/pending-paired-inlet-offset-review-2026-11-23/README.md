# D1809 — Review a pending paired duct inlet Offset

P5 direct face editing and reference accuracy, rows 16 and 31. [Issue #324](https://github.com/barocss/cad/issues/324). Base `43f623aaaca67916c0927d3d09e1daa8bf6567af`.

Verify one pending signed Offset of the original straight inlet on a paired line–arc–line Exact Sweep. Bind the moved inlet, retained outlet, both apertures, all native joins and the original rail to the same candidate and image revisions.

- **PASS — original refusal.** Actual Studio opens and previews the pending inlet Offset. The local MCP image request returns `MODEL_REVIEW_UNAVAILABLE` and preserves the proposal file byte for byte.
- **PASS — independent native geometry.** The original 10 mm straight inlet ends at x = −10 mm. The −4 mm Offset moves it to x = −6 mm and removes 128 mm³. The outlet remains at (20, 34, 0) mm. Both mouths have two four-edge apertures. All 24 internal tangent edges have both native charts, and the fixed 25 faces retain their native coefficients. Native volume is 1645.3096491487358 mm³ and the centroid matches the independent signed prism integral. Maximum checked chart gap is 1.0658141036401503e-14 mm.
- **PASS — actual desktop Studio WebGPU and local Agent.** With and without the retained Direct rail, both views return native SHA-256 `820dae4a53f3559b95a005c9911699f2e43036f24adf6496ee69e50602b10089`. The opposite views show both mouths. A changed rail rejects the old proposal pin, and a newly staged proposal on a detached rail refuses replay. Explicit Studio Accept, Save and fresh Open keep the original Direct data and reproduce the reviewed body and both PNGs. Standard SHA-256 `87b934d0f92b786253b0380094bc31b01e7e92ce1c8182bf9a6a63e191e5dc7f`. Opposite SHA-256 `c5808da01267fe82a02fcb2f40917b276bc8b299ba82bb6ebe4f137a3ddd502d`.
- **PASS — affected checks and controls.** 67 Model and 17 Studio tests pass. Scoped ESLint, Model types, browser syntax, Studio type check and production build and Git diff check pass. 21 desktop checkpoints have unchanged source capsules and zero page or console errors. Both existing outlet families retain their earlier native and PNG hashes.
- **FAIL — corrected test expectation.** The first Model run passed 66 of 67 tests. The independent checker accepts reordered apertures when each keeps its own bounds and tags. The corrected test exchanges only the tags and verifies that wrong native ownership refuses. Production code and tolerances stay fixed.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #324 remains open for its wider client and cost evaluation.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. Use the D1787 applied line–arc–line and D1801 applied arc–line files for retained rails. On the base source use `D1808_SOURCE_FROZEN=1` and replace `--review-outlet` with `--expect-review-unavailable` for the inlet case.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-evidence paired-elbow-outlet-offset-handle paired-line-arc-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/{pairedElbowOutletOffsetEvidence,pairedElbowOutletProposalReview}.ts src/chat/part/{modelCandidate,proposals,views}.ts test/paired-elbow-outlet-offset-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1790_RETAINED_RAIL="$APPLIED_LINE_ARC_LINE" D1809_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/retained" --inlet --review-outlet
D1809_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/standalone" --inlet --review-outlet
D1790_RETAINED_RAIL="$APPLIED_LINE_ARC_LINE" D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/outlet-control" --review-outlet
D1790_RETAINED_RAIL="$APPLIED_ARC_LINE" D1806_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/arc-first-outlet-control" --arc-first --review-outlet
pnpm --dir apps/cad-studio build
git diff --check
```

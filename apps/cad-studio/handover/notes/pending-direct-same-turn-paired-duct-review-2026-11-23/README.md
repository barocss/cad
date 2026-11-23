# D1804 — Review both passages on a pending same-turn Sweep

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `e5c25ce97689332b40f69746bb3a00be8b1360ee`.

Verify the authored same-turn arc pair independently before admitting the pending image. Reject equal-radius and tolerance-equivalent single carriers. Use the original copied-rail and candidate revision checks and the existing two-arc result format. Bind the two mouths, 24 walls and all 12 internal joins to the native body.

- **PASS — original refusal.** Actual Studio opens and previews the staged proposal. The local MCP render returns `MODEL_REVIEW_REPLAY_FAILED` and leaves the staged file byte-identical.
- **PASS — independent native proof.** The R12/R18 quarter arcs have a 32 mm² net section and length 15π mm. Both terminal planes face −X and carry two distinct four-edge apertures. Both native charts are present on all 12 internal edges. Native quadrature is 1507.9644737230951 mm³. Independent analytic volume is 480π mm³ and centroid is (6.3984672026842375, 15.819718634205493, 0) mm. The maximum checked chart gap is 1.1374233532693354e-14 mm.
- **PASS — actual desktop Studio WebGPU and local Agent.** Standard and opposite review images share native SHA-256 `58cdcc1b4e2266427a4358a03ac1be8cc9e5982bc2eae76a70bf1d3434db157f`. The opposite left view shows both mouths. Stale base, proposal and image pins and a changed authored rail refuse. Explicit Studio Accept, Save and fresh Open reproduce the native body and both PNGs. Standard SHA-256 `9a1ea03127ed071581385972b09719fc5b04c9ef4a9e56f4b8891b347affda6c`. Opposite SHA-256 `81ec465d71ded3300facb33747f49130186d3d446be056894d7ccc3abf39d871`.
- **PASS — affected checks and controls.** All 79 Model and 17 Studio tests pass. Cases cover both radius orders, same-turn arcs with 30° sweeps, oblique and radial X/Y frames, asymmetric lanes, invalid or single-carrier rails and missing or shifted join charts. Model types, scoped ESLint, browser-driver syntax, Studio type check and production build and Git diff check pass. The baseline, candidate and two controls record 48 snapshots. Both controls retain their prior native body and PNG digests. The browser flows report unchanged sources and no console or page errors.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange and live providers. The revolved physical cap edges retain their inherited absent chart pairs. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #324 remains open for its wider client and cost evaluation.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. Use `--expect-review-unavailable` with the baseline source.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence paired-line-arc-duct-evidence paired-elbow-outlet-offset-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/pairedSpacedArcDuctEvidence.ts src/chat/rectangularDuctProposalReview.ts test/paired-spaced-arc-duct-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1804_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --same-turn-arcs --review
D1799_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-opposite" --opposite-arcs --review
D1796_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-spaced" --spaced-same-turn --review
pnpm --dir apps/cad-studio build
git diff --check
```

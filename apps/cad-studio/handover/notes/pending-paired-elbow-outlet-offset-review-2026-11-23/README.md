# D1789 — Review a pending paired duct outlet Offset

P5 advanced modeling and reference accuracy, rows 16 and 31. [Issue #324](https://github.com/barocss/cad/issues/324). Base `fa8d17572d24389e3180b6cd707022a1f7987e0c`.

Bind one signed Offset of the original D1788 outlet to the saved authored Sweep and the exact candidate geometry. Verify both cap planes, passage ownership, both tangent junctions and the material removed or added. The Agent can read the same candidate through both PNG orientations and native inspection before any change is applied.

- **PASS, original refusal reproduced.** Desktop Studio showed the pending proposal preview. Local MCP returned `MODEL_REVIEW_UNAVAILABLE`. The pending file stayed byte-identical.
- **PASS, independent geometry.** A −4 mm move takes the cap plane from y=34 to y=30 mm. The original inlet, lead and bend retain 25 complete native face boundaries. The two 2 × 2 mm through passages retain their rim IDs and all 24 tangent seam IDs. The unchanged 32 mm² section gives a signed change of −128 mm³. Native quadrature changes from 1,773.3096491487372 to 1,645.3096491487372 mm³. Candidate native centroid is (10.727869173926502, 9.27213082607352, 1.009e−14) mm. Its distance from the independent centroid is below 2e−13 mm. Maximum chart gap is 1.066e−14 mm. Focused tests cover both signs, restoration, unequal and reordered passages, non-default world frames, invalid distance and changed source, charts and wall ownership.
- **PASS, actual Studio WebGPU and local Agent.** Review returned native body SHA-256 `39ec778cbb535d30b295013d740ee15489f29a75320222b28417817028c727e3` under both image pins. Native inspection matched both cap planes in each orientation. Stale base, proposal and image pins refused. Review left the pending bytes unchanged. Explicit Studio Accept, Save and fresh Open reproduced the native body and both PNGs byte-for-byte. Standard PNG SHA-256 is `63e5a5cda74d336063c149ad014625237be4c6acc9c5cfe019529097cfb5ce7b`. Opposite PNG SHA-256 is `1c6fe8496e857f2369c883182b03a31a594893785b9245a04204157c5091244b`.
- **PASS, regressions and affected checks.** The D1787 creation review retained its native observations, geometry evidence and both PNGs. D1788 retained all four native Offset observations. The four desktop runs recorded 31 snapshots with zero page errors, console errors or source changes. 44 Model tests, 39 Studio tests, changed-file ESLint, Model type check, Studio type check and production build, and Git diff check pass. The first type check caught a test fixture that assigned to a read-only property. The fixture now copies the changed vertex.
- **FAIL, inherited Model aggregate lint.** Two self-imports in `api-density.test.ts` and three unused bindings in `sketch-reopen-side-ids.test.ts`. Both files and the lint policy match base.
- **NOT_RUN.** Full local suites, other viewport backends, physical History drag for this profile, mobile, live providers and broader offset families. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #324 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. For the baseline, use the browser driver with `--expect-review-unavailable` on the original Model sources.

```sh
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/review" --review-outlet
D1787_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-elbow" --straight-tail --review
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-offset"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-evidence paired-line-arc-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-plane-pick-feedback history-feature-editor tool-contract-mcp
pnpm --dir packages/barocss-cad-model exec eslint src/chat/part/{modelCandidate,proposals,views}.ts src/chat/{toolDefinitions,pairedElbowOutletOffsetEvidence,pairedElbowOutletProposalReview}.ts test/paired-elbow-outlet-offset-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

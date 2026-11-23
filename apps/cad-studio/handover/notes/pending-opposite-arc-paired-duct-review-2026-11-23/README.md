# D1799 — Review the direct paired S-bend before Agent approval

P5 modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `46f83382d6113e911800b194165d019391b7ed8e`.

Recognize the two copied opposite-turn circular spans independently and use the common paired-duct verifier for both mouths, 24 tagged walls, all 12 join edges and mass. Pending review reports `two-arc` with one junction. Both images bind to the exact candidate and its source revisions.

- **PASS — original refusal.** Actual Studio displays the pending proposal. The local MCP render returns `MODEL_REVIEW_REPLAY_FAILED`. The staged file stays byte-identical.
- **PASS — native proof.** Two exact terminal planes retain two separate four-edge apertures each. The single tangent junction has four exterior and eight interior edges, each with both native charts. Independent volume is 1,507.9644737231006 mm³ and native quadrature gives 1,507.9644737230967 mm³. The independent centroid is (14.18028136579451, 15.819718634205488, 0) mm. Maximum checked chart gap is 1.081e−14 mm. Physical terminal planes retain the D1798 chart-pair limitation.
- **PASS — actual desktop Studio WebGPU and local Agent.** Standard and opposite views bind to native SHA-256 `2c95c2c4f906dd1de2f6ff01afbbe6eb4e16120f1a7f50a0624fd3907a933e71`. Stale base, proposal and image pins refuse. A changed authored rail blocks reuse of the old review. Explicit Studio Accept, Save and fresh Open reproduce the native body and both PNGs. Standard PNG SHA-256 `ccb63b01c71ac367e519056b59eb61541ee350a4f7b6c604443f7f18be66d0d0`. Opposite PNG SHA-256 `39dc15836f190e4bd74ce5bc0e3219993857ced221b1c0585374006bd2a55083`.
- **PASS — focused and existing checks.** Six new cases cover the direct native rail, asymmetric edits with stable native IDs and untouched second passage, oblique arc limits, radial sketch Y, reversed stored curves, individual chart damage, and refusal for incorrect ownership, malformed paths or same-turn paths. All 64 Model and 17 Studio tests pass. Scoped ESLint, Model types, Studio type check and production build, browser-driver syntax and Git diff check pass.
- **PASS — controls.** The baseline, direct paired duct, spaced same-turn control and single-aperture S-bend control record 47 snapshots with unchanged source capsules and zero page or console errors. D1796 paired PNGs and the D1705 native and PNG hashes match their records.
- **FAIL.** None in the affected D1799 checks.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange for this profile and live providers. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured. Issue #324 stays open for the broader client and cost evaluation.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. On base sources replace `--review` with `--expect-review-unavailable` for the direct paired case.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence paired-line-arc-duct-evidence paired-elbow-outlet-offset-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/pairedSpacedArcDuctEvidence.ts src/chat/rectangularDuctProposalReview.ts test/paired-spaced-arc-duct-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1799_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/direct-paired" --opposite-arcs --review
D1796_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-spaced" --spaced-same-turn --review
D1705_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --opposite-arcs --review
pnpm --dir apps/cad-studio build
git diff --check
```

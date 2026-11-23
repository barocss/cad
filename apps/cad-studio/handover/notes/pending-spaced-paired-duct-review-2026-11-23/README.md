# D1794 — Review the paired spaced S-bend before Agent approval

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `5b6bb1d883046c24a614d8a07062080d14485ef8`.

Certify both rectangular passages on the D1792 opposite-turn arc–line–arc candidate from the copied rail and its native solid. Bind both physical mouths, the 36 tagged walls and both twelve-edge junction groups to the same Agent candidate.

- **PASS, baseline reproduction.** Actual Studio shows the pending proposal. Local MCP render returns `MODEL_REVIEW_REPLAY_FAILED`. The pending source bytes stay equal.
- **PASS, native proof.** Both cap planes and four aperture loops match the copied rail and authored passage tags. All 24 tangent joins have both native charts. The physical cap proof uses exact planar support and reciprocal 3-D edges. The terminal cap chart-pair limitation remains as recorded in D1792. Independent volume is 1,763.9644737231006 mm³ and native quadrature gives 1,763.9644737230974 mm³. The independent centroid is (13.86386227801927, 19.94926977428006, 0) mm. Maximum checked chart gap is 1.192e−14 mm.
- **PASS, actual desktop Studio WebGPU and local Agent.** Both orientations pin the original native body SHA-256 `380dbdbf82845c319272ad1318e15c2042e9bccfa2da4e6f0bb425b5780c6a21`. Image and exact native cap and wall inspection match. Stale source, proposal and image pins refuse. Explicit Studio Accept, Save and fresh Open reproduce the same native body and PNG bytes. Standard PNG SHA-256 `be1027f2e5e90800aa9f631ccb8c271cbb4196a52b1627e3e78b51be8621acc9`. Opposite PNG SHA-256 `66c9df611e7841569b3ec329fc6f110fbee26881e942210d93c0c46dafb624f5`.
- **PASS, affected checks before the type-only fixture correction.** All 49 snapshots from baseline, candidate and both controls have unchanged source capsules and no page or console errors. The preceding paired elbow and straight-to-arc controls each retain seven native observations and both PNGs exactly. 51 Model tests, 17 Studio tests and scoped ESLint pass.
- **FAIL, initial Model type check.** The compiler reported two implicit types in the focused fixture. The fixture now binds cap results to the helper's declared return type. The production code and test assertions are unchanged by this correction.
- **PASS, final validation after session recovery.** All 51 Model tests and 17 Studio tests pass again with the corrected fixture. Changed-file ESLint, the full Model type check, Studio type check and production build, and Git diff check pass. The restarted actual desktop Studio flow records 16 snapshots with unchanged sources and zero page or console errors. Both native and PNG hashes match the earlier run. The system gate waited 383 seconds for load to fall below its normal limit.
- **NOT_RUN.** Full local suites, other viewport backends, mobile and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #324 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. On base sources use `--expect-review-unavailable` in place of `--review` on the spaced case.

```sh
D1794_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/spaced-review" --spaced-opposite --review
D1787_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-elbow" --straight-tail --review
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-lead" --review
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence paired-line-arc-duct-evidence paired-elbow-outlet-offset-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/pairedSpacedArcDuctEvidence.ts src/chat/rectangularDuctProposalReview.ts test/paired-spaced-arc-duct-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

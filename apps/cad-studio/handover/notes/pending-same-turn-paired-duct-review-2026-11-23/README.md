# D1796 — Review the paired same-turn duct before Agent approval

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `0f4545329913af91e70553abf52ed2fd1856919b`.

Extend independent native review to D1795 same-turn arc–line–arc ducts. Recover the second turn from the authored rail and apply its sign to the native wall supports and terminal radial frame. Retain the existing evidence API, admission tolerances, four aperture loops, 36 tagged walls and all 24 charted tangent joins.

- **PASS, baseline reproduction.** Actual Studio displays the pending same-turn proposal. The local MCP render returns `MODEL_REVIEW_REPLAY_FAILED`. Pending source bytes stay unchanged.
- **PASS, independent native evidence.** The same-turn body has both terminal planes pointing −X and keeps the four separate aperture loops. All 36 tagged walls and both twelve-edge junctions belong to that candidate. Both charts are checked at every joined edge. Independent volume is 1,763.9644737231006 mm³ and native quadrature is 1,763.9644737230915 mm³. Independent centroid is (7.211404434399708, 19.94926977428003, 0) mm. Maximum checked chart gap is 1.138e−14 mm. Physical terminal proof retains the D1792 absent-cap-chart-pair limitation.
- **PASS, actual desktop Studio WebGPU and local Agent.** Standard and opposite image revisions bind the source, proposal and original native body SHA-256 `3b3874616b42406e1d731d90851d412df222eaabbbd06d812f91949d9d6fe234`. Stale source, proposal or image pins refuse. Explicit Studio approval, Save and fresh Open reproduce that body and both PNGs. Standard PNG SHA-256 `f020b569bb674e3c0db48a6869f2a080fce16bd61c5e7d4a73405d6b8745cabb`. Opposite PNG SHA-256 `4b80cdf145c6522b9f4197f75d326d83b01b11cfe1ca363422e7c15c20bba584`. Changed authored rail geometry refuses the prior review.
- **PASS, focused regressions.** Fourteen native evidence cases cover both turn directions, both physical mouths, every individual missing or shifted join chart, asymmetric passages, native IDs, changed source ownership, independent centroid, translated oblique 30°/120° paths, radial sketch Y, storage order and winding. A source and native body from different turn directions refuse.
- **PASS, controls and affected checks.** Baseline, candidate, opposite-turn control and straight-to-arc control record 49 snapshots with unchanged source capsules and no page or console errors. All six opposite-turn native observations and both pinned Agent PNGs match D1795 byte-for-byte. All 58 Model tests and 17 Studio tests, changed-file ESLint, full Model types, Studio type check and production build, and Git diff check pass.
- **FAIL.** None in the D1796 affected checks. The inherited Kernel code-shape failure is recorded in D1795 and is not rerun by this Model-only change.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange for the paired profile and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #324 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. For the base run replace `--review` with `--expect-review-unavailable` on the same-turn case.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence paired-line-arc-duct-evidence paired-elbow-outlet-offset-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/pairedSpacedArcDuctEvidence.ts test/paired-spaced-arc-duct-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1796_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/same-turn" --spaced-same-turn --review
D1794_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-opposite" --spaced-opposite --review
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control-lead" --review
pnpm --dir apps/cad-studio build
git diff --check
```

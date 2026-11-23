# D1806 — Review a pending arc-first paired duct outlet Offset

P5 direct face editing and reference accuracy, rows 16 and 31. [Issue #324](https://github.com/barocss/cad/issues/324). Base `f040af9c7ad23e5a48e64265eb776b886369cf80`.

Use the independent arc–line duct check for a pending signed Offset of its original straight outlet. Bind both aperture loops at each end, the 12 charted tangent joins and the retained inlet and bend to the current candidate. Where present, bind the original Direct rail to the path copied into the original Sweep.

- **PASS — original refusal.** Studio opens and previews the pending signed Offset. The local MCP render returns `MODEL_REVIEW_UNAVAILABLE` and leaves the staged file byte-identical.
- **PASS — independent signed geometry.** A −4 mm move from x = −10 mm to x = −6 mm removes 128 mm³. The original and moved outlet each have two four-edge apertures. The retained inlet and 12 bend walls keep their native boundary coefficients. The single tangent join has all 12 edges with both charts. Native volume is 1197.3096491487277 mm³, the centroid agrees with the independent signed-prism integral, and maximum checked chart gap is 1.0658141036401503e-14 mm.
- **PASS — actual desktop Studio WebGPU and local Agent.** With and without a retained Direct rail, the standard and opposite PNGs bind to native SHA-256 `e299366b4a53c4c8a325317ae352395b716edb8bbd58932218f88e4ffc1f1873`. Opposite views show both mouths. The original Direct data survives explicit Accept, Save and fresh Open. A changed retained rail refuses the stale pin. A newly staged proposal with a detached rail refuses replay. Both reads preserve source bytes. Explicit Accept, Save and fresh Open reproduce both images. Standard PNG SHA-256 `aec25840de6bfba97a5681ea0362ecefc3885d12cb44ba2837471fc195805199`. Opposite PNG SHA-256 `8e35dd2f71dcc6603dc3c0ae59ab950dfe28b5e54fbe6c163d805d4877b33658`.
- **PASS — affected checks and control.** 60 Model and 17 Studio tests pass. Scoped ESLint, Model types, browser syntax, Studio type check and production build and Git diff check pass. The four desktop runs record 16 snapshots with unchanged source capsules and no console or page errors. The original line–arc–line review retains its native body and both PNG hashes.
- **FAIL — corrected independent check.** The first Model run passed 59 of 60 tests. In an oblique 30° case, the retained native boundary matched byte-for-byte, while a derived inlet interval differed by about 1.3e−15 mm. Compare only the derived centers and intervals at the existing 1e−7 mm tolerance. Keep native coefficients, plane, dimension, owner and edge checks exact. The first type check also found an optional `nextId` in the stale-candidate test. The test now checks that the fixture provides it before changing it.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #324 remains open for wider client and cost evaluation.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. Use the unchanged D1801 arc–line and D1787 line–arc–line applied documents for the two retained-rail runs. On the base source replace the first `--review-outlet` with `--expect-review-unavailable`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-evidence paired-elbow-outlet-offset-handle paired-line-arc-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model exec eslint src/chat/{pairedElbowOutletOffsetEvidence,pairedElbowOutletProposalReview}.ts test/paired-elbow-outlet-offset-evidence.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1790_RETAINED_RAIL="$APPLIED_ARC_LINE" D1806_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/retained" --arc-first --review-outlet
D1806_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/standalone" --arc-first --review-outlet
D1790_RETAINED_RAIL="$APPLIED_LINE_ARC_LINE" D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control" --review-outlet
pnpm --dir apps/cad-studio build
git diff --check
```

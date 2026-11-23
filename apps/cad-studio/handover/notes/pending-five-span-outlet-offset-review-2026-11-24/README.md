# D1823 — Review the five-span outlet offset before Agent approval

P5 native modeling and direct face editing, rows 07, 16 and 31. [Issue #324](https://github.com/barocss/cad/issues/324). Base `cbca96bf6af0458fab044d2cd352658fef58725b`.

Use the five-span paired S-bend verifier for both the original Sweep and the pending outlet offset. Rebuild the expected path from the requested signed displacement of the last two poles. Compare both native bodies, including the original retained Direct rail. Keep the existing proposal evidence format and the arc–line control.

- **FAIL — reproduced on the base.** The local pending review returns `MODEL_REVIEW_UNAVAILABLE` for the valid [D1822](../paired-five-span-outlet-offset-2026-11-24/README.md) offset. The proposal and source document stay intact.
- **PASS — independent native evidence.** For −4 mm, the outlet moves from (36, 38, 0) to (32, 38, 0) mm. The inlet stays at (−10, 0, 0) mm. Both outlet apertures stay separate. The inlet, bends, spacer and 49 fixed face records stay unchanged. All four sets of 12 charted internal joins remain intact. A 32 mm² net section predicts −128 mm³, versus −127.99999999999818 mm³ from the two native bodies. The result has volume 2147.9644737231 mm³. Signed and oblique cases, altered charts and incorrect rail data have focused coverage.
- **PASS — actual desktop Studio and local MCP.** The pending proposal shows two reviewed images with distinct orientations. A changed source rail makes the old review pin stale. Preview leaves the pending document intact. Explicit Accept, Save and fresh Open reproduce the native result and review images, with the retained rail still present. The arc–line control reproduces both D1806 images byte for byte. The two candidate runs have nine Chrome checkpoints, zero browser errors and zero changes to 1217 frozen inputs.
- **PASS — affected checks.** 94 Model and 19 Studio tests. Model and Studio types, scoped lint, production build, browser driver syntax and Git diff check pass.
- **NOT_RUN.** Full local suites, other rendering backends, mobile, live providers and broader review clients or cost. #324 stays open. First mechanical CAD remains 8/10 accepted and overall CAD completion remains unmeasured.

| Review artifact | SHA-256 |
| --- | --- |
| Approved and reopened native body | `d8b4a0e6fb4911b69e69f43a2fa2d90a901daff51567465d1e904d3b754e50b3` |
| Pending image | `13ca9a4f45938717a211c0d318c8fc45c9560dae1cab25ea41892c72d3aded83` |
| Opposite pending image | `1b630c63eafbdbed1d0e6319144f21f29a89f7afdd9fd69b31dbe9ad1870e2e1` |
| Original rail path | `745873104c647cbcd7c62114586de3ff8994af263b08b7b7ea9e3ddb735f1b36` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output. Set `RAIL_FILE` to the applied native D1819 Studio result. On the base, run the five-span browser case with `--expect-review-unavailable` and `D1822_SOURCE_FROZEN=1`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-evidence paired-spaced-arc-duct-evidence rectangular-duct-proposal-review paired-elbow-outlet-offset-handle toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test proposal-review-availability offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{pairedElbowOutletOffsetEvidence,pairedElbowOutletProposalReview}.ts packages/barocss-cad-model/test/paired-elbow-outlet-offset-evidence.test.ts apps/cad-studio/test/{offset-paired-elbow-outlet-browser,paired-elbow-outlet-review-browser-steps}.mjs
pnpm --dir apps/cad-studio build
D1823_SOURCE_FROZEN=1 D1790_RETAINED_RAIL="$RAIL_FILE" node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/studio" --s-bend --review-outlet
D1806_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control" --arc-first --review-outlet
git diff --check
```

# D1825 — Review the five-span inlet offset before Agent approval

P5, rows 07, 16 and 31. [Issue #324](https://github.com/barocss/cad/issues/324). Base `c63bc0ce6104810350462216653d1961ca3f5023`.

[D1824](../paired-five-span-inlet-offset-2026-11-24/README.md) admits the original straight inlet in signed native Offset Face. Use the same five-span verifier on the source and on the path reconstructed from the first two poles after the edit. Link the pending images to the original unmodified Direct rail. Keep the verified outlet and all fixed geometry.

- **FAIL — reproduced on the base.** The signed inlet edit builds and can be proposed. Local MCP returns `MODEL_REVIEW_UNAVAILABLE` for a pending image. The original proposal and document stay intact.
- **PASS — independent native evidence.** For −4 mm, the inlet moves from (−10, 0, 0) to (−6, 0, 0) mm. The outlet stays at (36, 38, 0) mm. Both passages stay separate. The fixed outlet, bends and spacer retain 49 native face records and all 48 pairs of tangent joins. The 32 mm² net cross section predicts −128 mm³ and the independent material moments agree with the native centroid. The focused cases cover both signed directions, oblique geometry, changed charts and face owners, wrong native output and changed rail data.
- **PASS — local MCP and actual desktop Studio.** Two orientations show the edited inlet and fixed outlet. Both use the same native body with different image pins. Linked inspections resolve the named terminal and aperture faces. A changed rail makes the earlier review stale. Explicit Accept, Save and fresh Open reproduce both images and the accepted native body with the original rail. The three-span inlet and five-span outlet controls reproduce all four previous images byte for byte. The final runs have 14 checkpoints and zero browser errors or frozen source changes.
- **PASS — affected checks.** 99 Model and 19 Studio tests. Model and Studio types, scoped lint, production build, driver syntax and Git diff check pass.
- **FAIL — first control launch.** Chrome did not create the three-span control context. The owned browser was stopped before navigation. The retry used the driver’s existing local-only routes and left the product and driver unchanged.
- **NOT_RUN.** Full local suites, other rendering backends, STEP, mobile, broad review clients, cost measurements and live providers. #324 stays open for its wider acceptance. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

| Review artifact | SHA-256 |
| --- | --- |
| Approved and reopened native body | `ed5dfd1fcd403e87e6c45edfef6990267aa0d45081bebe426977be36aa56b539` |
| Pending image | `4af52bf45a1fbe6e525bbc905e3337d7fa5d1e867dbbaa44f2f239ae720226fd` |
| Opposite pending image | `b0bd7453781f50d53948473911dd34eed0754322303967fcccf49f667b5853c0` |
| Retained original rail path | `745873104c647cbcd7c62114586de3ff8994af263b08b7b7ea9e3ddb735f1b36` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output. Set `RAIL_FILE` to the applied native D1819 Studio result. On the base, use `D1824_SOURCE_FROZEN=1` and replace `--review-outlet` with `--expect-review-unavailable` in the five-span inlet command.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-evidence paired-spaced-arc-duct-evidence rectangular-duct-proposal-review paired-elbow-outlet-offset-handle toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test proposal-review-availability offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1825_SOURCE_FROZEN=1 D1790_RETAINED_RAIL="$RAIL_FILE" node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/studio" --s-bend --inlet --review-outlet
D1809_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/three-span-control" --inlet --review-outlet
D1823_SOURCE_FROZEN=1 D1790_RETAINED_RAIL="$RAIL_FILE" node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/outlet-control" --s-bend --review-outlet
git diff --check
```

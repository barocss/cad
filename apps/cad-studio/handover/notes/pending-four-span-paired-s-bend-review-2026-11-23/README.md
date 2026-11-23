# D1814 — Review the pending four-span S-bend

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `772ef50dc252cd0ce85f5f330af5e1746aca1011`.

Extend the independent four-span checker to the D1812 S-bend. Recover the original opposite-turn directions from the authored rail. Certify lead-to-second-bend separation and verify both caps, all named walls, native charts and mass before the existing Agent renderer returns the pending images.

- **PASS — original refusal reproduced.** Actual Studio opens the S-bend proposal and shows its pending preview. The pinned local MCP image request returns `MODEL_REVIEW_REPLAY_FAILED` and preserves the proposal bytes.
- **PASS — independent native evidence.** The two mouths are (−10, 0, 0) and (30, 38, 0) mm with outward −X and +X normals. The single closed shell has genus two, 48 wall faces, two planar caps and all 36 internal edges with two charts. The lead inlet has 12 chart pairs. The checker uses the signed opposite-turn separation bound and the independent path and section integrals. Focused cases require the correct turn and native lane ownership for both radial axes, bend polarities and oblique source paths. Incorrect rails, lanes, planes and charts fail verification.
- **PASS — actual Studio desktop Chrome WebGPU and local Agent.** The standard and opposite images identify the outlet and inlet respectively. Both bind to one candidate with correct face details. Stale part, proposal, image and changed-rail pins refuse. Explicit Studio Accept, Save and fresh Open reproduce both PNGs and the native body.
- **PASS — affected checks and controls.** 90 Model and 17 Studio tests, scoped ESLint, Model and Studio type checks, Studio production build, browser driver syntax and Git diff check pass. Four updated Chrome runs contain 62 checkpoints, zero source changes and zero browser errors. The same-turn four-span and three-span S-bend retain their recorded native and PNG hashes. The closed-circle control retains its native hashes.
- **NOT_RUN.** Other path and profile reviews, full local suites, alternate viewport backends, mobile, STEP and live providers. First mechanical CAD remains at 8/10 accepted. Overall CAD completion remains unmeasured. Issue #324 remains open for broader client and cost verification.

The independent volume is 2083.9644737231006 mm³ and the native quadrature volume is 2083.9644737230897 mm³. The independent centroid is (10.967250553068993, 16.88598994956946, 0) mm. Native quadrature agrees and the maximum checked gap is 1.1916163935586911e-14 mm.

| Bound evidence | SHA-256 |
| --- | --- |
| Authored rail | `93a098c7ad6b399d1db71c2bc31b17ed67a6e982b29858dfa926bdd704cb9727` |
| Native candidate | `7dddf8c18a08523f7f9bf6d7ee9f44dc5f9012ac5b7d3b9c3e4d4c656c112acf` |
| Standard PNG | `02ce29eee5cab59c42e47bf796fe152b1e4792badda75233d03b80a9b1e39785` |
| Opposite PNG | `d3f4baa021d3ddc4bf19ae917798c0366cb52627234629582a9284c7760cc888` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. On the base source use `D1812_SOURCE_FROZEN=1` and replace `--review` with `--expect-review-unavailable` for `--lead-opposite`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-spaced-arc-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review paired-elbow-outlet-offset-evidence sweep-history-edit toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/pairedSpacedArcDuctEvidence.ts packages/barocss-cad-model/test/paired-spaced-arc-duct-evidence.test.ts apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
node --check apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
D1814_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --lead-opposite --review
D1811_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/four-span-same-turn" --lead-same-turn --review
D1794_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/three-span-opposite" --spaced-opposite --review
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/closed-control"
pnpm --dir apps/cad-studio build
git diff --check
```

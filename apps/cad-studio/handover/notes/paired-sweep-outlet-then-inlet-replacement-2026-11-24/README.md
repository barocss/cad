# D1892 — Replace the original Sweep inlet after its inward tilted outlet

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `25255392001e444133d3535f84b7dd4cb3e907a3`.

The original inlet can now follow one inward tilted replacement of the original outlet. Either order uses the same bounded native replay. The first Replace must be a direct edit of the original exact five-span Sweep. The second must target the opposite original cap. The Kernel replays the first trim and compares the complete native parent before cutting the other end.

- **FAIL, original desktop.** The first outlet edit applies. The correctly selected original inlet cannot start Replace face. The expected old-scope reproduction passes.
- **PASS, independent native geometry.** Either order yields the same strict genus-2 B-rep. Volume is 2211.9644737231 mm³ and centroid is (12.8208933118, 18.6575343541, 0) mm. Moving the first outlet plane from X35 to X34 and retaining the inlet at X−9 gives 2179.9644737231 mm³ and centroid (12.5026627065, 18.3736036258, 0) mm. The original face IDs, both passage loops, all planar walls and all 48 join charts remain. A second edit of the same cap and a third edit refuse.
- **PASS, actual Studio.** Eight actual outlet-first and eight inlet-first states pass. Both initial final solids have native digest `dfce16c20a4029b5445de68fc20467da181b2ba3e4e2f51eaf51d9da22f388c9`. Moving the original outlet donor in the reverse order changes only the outlet; the second inlet cap remains identical. Undo, Redo, Save and fresh Open retain the linked document and the updated native digest `d18f2194af9a1bf5af0d697f76fcca53062634fe6a750047917b3ba9da9e7a7b`. A held first donor refuses Open with the current accepted part retained. An independent Sol High calculation verifies the volume, centroid and unchanged opposite boundary.
- **PASS, affected checks.** 72 Kernel, 104 Model and 9 Studio tests, both package type checks, scoped lint and Studio production build.
- **NOT_RUN.** Whole local suites, outward tilt, wider Sweep and edit families, pinned Agent review of the two-edit path, mobile and live providers. The broader #17 remains open. First mechanical CAD remains 8/10.

## Reproduce

Use Node 22.19.0 and existing desktop Chrome and Playwright. Run heavy checks serially and freeze the checkout during Studio.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs packages/barocss-cad/test/api-part.test.mjs
pnpm --dir packages/barocss-cad-model test replace-face paired-elbow-outlet-offset-handle paired-elbow-outlet-plane-proposal-review offset-to-plane offset-face-native native-offset-face feature-handles
pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1892_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-sweep-two-cap-replacement-browser.mjs "$OUT/reverse" --reverse
D1891_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-sweep-two-cap-replacement-browser.mjs "$OUT/forward"
```

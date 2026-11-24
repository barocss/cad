# D1894 — Reuse the first rectangular through-cut across later Differences

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `06a3671c28dbb84352ba987667d3385d4efdfc94`.

Linear, Rectangular, Fill and Path can reuse the first original through-cut on one rectangular stock. The Model follows direct unsuppressed Difference parents. The Kernel checks each native result against the stock and the set of all rectangular through-openings at that stage. All original cuts and added copies must stay inside the stock and clear of each other. The same feature references, placement rules and existing document and copy limits apply.

- **FAIL, previous Studio.** With four original cuts, selecting `Subtract 1 (n4)` in the Browser and launching Linear refused the selected source. The notice offered `Subtract 4 (n13)`. The baseline expected-refusal test passes. Its first harness run expected a fallback panel. The capture showed the notice and no panel, and the observation was corrected before the final baseline.
- **PASS, actual desktop Studio.** Eight four-cut Linear states, four Path launch and Cancel states and seven two-cut Linear control states pass. Browser and History keep source `n4` and target `n13`. X +8 mm adds `[16,8]–[20,10]`. The strict native result has one genus-five solid, five rectangular openings through both caps, 26 faces, 72 edges and volume 23,560 mm³. The centroid is `(30.171477079796265, 20.113752122241088, 5)` mm. X +16, X +34 and Y +18 mm intersect the fourth, third and second original cuts respectively. Their previews refuse with Apply disabled and identical document and Undo label. History X −6 mm, Undo/Redo, native Save and fresh Open keep all five openings and the original feature references.
- **PASS, affected checks.** 41 Kernel, 50 Model and 9 Studio tests. The Kernel checks all four pattern kinds across five original cuts, independent native moments and topology, saved feature and wall ownership, duplicate cutters, and copy collisions. Kernel build, Kernel and Model types, Studio production build, focused lint, browser syntax and Git diff checks pass.
- **NOT_RUN.** Whole local suites, arbitrary cutter families, general dependent-reference recovery, mobile and live providers. #25 stays open. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

## Reproduce

Use Node 22.19.0 and existing desktop Chrome and Playwright. Run heavy jobs serially and freeze the checkout during Studio.

```sh
(cd packages/barocss-cad && node scripts/tool.mjs build:fast)
node --test --test-concurrency=1 packages/barocss-cad/test/prior-{linear,rectangular,fill,path}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1894_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --linear-four
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/history-path"
D1830_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/direct-linear" --linear
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

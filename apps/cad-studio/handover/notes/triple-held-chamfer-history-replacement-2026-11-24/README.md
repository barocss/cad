# D1834 — Replace three held Chamfer edges together in History

P1, rows [15](../../roadmap-rows/15.md) and [16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `7a2e30e50c28e85217f332d0e2b9dd20493f1b40`. Extends [D1768](../dual-held-chamfer-history-replacement-2026-11-23/README.md) for one terminal constant-distance Chamfer with three held straight references.

- **FAIL, base.** Actual Studio opens a signed model with a changed stock outline and three held references. The History feature editor offers neither a single replacement nor the grouped action. The 525 mm³ stock has no bevels applied.
- **PASS, desktop Studio WebGPU.** The authored slots can be selected out of order. A duplicate pick preserves the staged selection, and Apply stays disabled with an empty slot. A subsequent valid pick retires the duplicate notice. Cancel preserves the original document, body, selection and History. One Apply writes all three signatures in authored slot order after checking the live native result. Undo restores the original signatures and all three held decisions. Redo, Save and fresh Open restore the exact accepted document, including the bound `Bevel` distance.
- **PASS, independent analytic geometry.** The original convex bevels give 1752 mm³, with three 2 mm triangles removed from the 590 mm² section. The recovered 3 mm thick L-section has two convex bevels and one concave bevel. The prism gives 519 mm³, centroid `[6953/1038,6953/1038,1.5]` mm, 11 planar faces, 27 edges and 18 exact vertices. The separately built wrong third bevel also gives 519 mm³ but a different X centroid and cap contact coordinates. The oracle rejects it. Strict native checks pass on the original, the accepted result and the freshly opened part.
- **PASS, affected checks.** 23 Studio tests, scoped ESLint, types and production build, driver syntax and Git diff check. Three final desktop runs give 27 checkpoints, with zero page errors, console errors or frozen source changes. The two-edge Chamfer still passes; the Fillet control also preserves both explicit picks and its accepted source after a native refusal.
- **NOT_RUN.** Fixture construction by mouse, four or more held edges, general topology or dependent features, other GPU backends, mobile and full local suites. #20 remains open. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the heavy gate and external evidence folders. Run the baseline with the candidate driver on the base.

```sh
D1834_SOURCE_FROZEN=1 node apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/base" --baseline
D1834_SOURCE_FROZEN=1 node apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/studio"
D1768_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/chamfer-control" --chamfer --dual-manual
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/fillet-control" --dual-native-refusal
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
pnpm exec eslint apps/cad-studio/src/{App.tsx,state/heldFinishReplacement.ts,state/useHeldFinishEdge.ts,ui/NodeEditor.tsx} apps/cad-studio/test/{held-finish-replacement.test.ts,three-held-chamfer-browser.mjs}
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/three-held-chamfer-browser.mjs
git diff --check
```

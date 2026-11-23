# D1828 — Repeat the earlier rectangular cut on the current two-cut stock

P1, rows 15 and 16. [Issue #25](https://github.com/barocss/cad/issues/25). Base `8407eb9b034e95022870894b5ca8325c8a9fb502`.

A selected current Difference still owns the target solid. An explicitly selected direct earlier Difference can supply the prototype for Rectangular cut pattern. The stored `source` reference and the current `parent` remain distinct. Require original upright rectangular stock and two disjoint interior rectangular through-cuts. Verify both native cavities and each new XY cell before applying any copies. Keep the accepted stock and cavity identities, source history and no-source recipe format.

- **FAIL — reproduced on the base.** Selecting the first Subtract in Browser or History prevents the Rectangular cut pattern from starting. The notice names the second current source. Explicit body selection still previews that current source. The original document stays intact.
- **PASS — native geometry.** The 60 × 40 × 10 mm stock has an 8 mm² earlier cut and a 12 mm² later cut. The 2 × 2 grid with X16/Y8 mm repeats only the 8 mm² source. Cap openings have centers (10, 9), (26, 9), (10, 17), (26, 17) and the unchanged later (11, 27) mm. Native volume is 23560 mm³, with one strict genus-five solid, 26 faces, 36 loops, 144 coedges, 72 edges and 48 vertices. The independent centroid is (712920/23560, 472600/23560, 5) mm. With no explicit source, the current-tool control has 23440 mm³. Wrong or unrelated sources, nonoriginal cutters, non-through cuts, overlaps and boundary touches refuse.
- **PASS — desktop Studio.** Browser and History both display Subtract 1 (n4) when deliberately chosen. The authored later Subtract (n7) remains the active result input. Y18 mm overlaps the later cut and refuses without changing the model or Undo history. Both creation entries produce the same native result and document. A saved X-spacing edit from 16 to 18 mm moves only the two copied cuts in the second X column. Undo, Redo and fresh Open preserve both source and target references and the verified physical openings. Other cut-pattern commands retain the existing earlier-source refusal.
- **PASS — affected checks.** 35 Kernel, 13 Model and 4 Studio tests. Kernel library, three type checks, scoped lint, Studio production build, driver syntax and Git diff check pass. Actual browser scope includes 32 candidate and control checkpoints and no page or console errors or source changes.
- **FAIL — corrected Kernel test input.** The first nonrectangular refusal fixture still used a rectangle's four side tags after changing to a circle. The corrected one-tag source reaches the intended earlier-source refusal. All 35 Kernel tests then pass.
- **FAIL — inherited Kernel code-shape gate.** The three existing spread-minmax counts remain in unchanged cylindrical-bore, thicken-cylinder and thicken-planar files.
- **NOT_RUN.** Full local suites, local Agent command details, other backends, mobile, more distant or arbitrary consumed cuts and earlier-source Linear, Fill or Path support. #25 stays open. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output. On the base, use the existing source-intent browser driver for the earlier Rectangular Subtract refusal and the explicit current selection. Run the new driver on the fixed source.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,fill,curve}-cut-pattern.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern linear-cut-pattern fill-cut-pattern curve-cut-pattern
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1828_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio"
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/other-pattern-control"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```

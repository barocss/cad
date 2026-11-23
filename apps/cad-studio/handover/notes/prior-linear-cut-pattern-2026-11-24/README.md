# D1830 — Repeat the direct earlier rectangular cut along a signed line

P1 rows 15 and 16. [Issue #25](https://github.com/barocss/cad/issues/25). Base `31b6ea579dab1ce02b69e94897d51bcbb5485bdb`.

The retained D1828 Chrome control on the same stock shows the Linear command refusing Subtract 1 from Browser and History at both desktop sizes. The current Subtract 2 command still opens. The model and Undo history stay unchanged. D1830 reuses this reproduction.

An explicit source selects the direct earlier original rectangular through-Subtract. The active later Difference remains the target. The kernel certifies the same two original interior rectangular cuts used by D1828. It validates one X or Y row with signed nonzero spacing. A touching or overlapping cell and a cell outside the stock refuse before a copy is applied. Keep the original and later native wall names and give each copy its existing Linear suffix. The no-source command and public fluent options remain unchanged. The additive raw recipe, saved Model references and revision-bound Agent command all name the same source and target separately.

- **PASS — native contract.** The 60 × 40 × 10 mm stock carries the original 8 mm² earlier cut and the unchanged 12 mm² later cut. X +16 mm and −6 mm at Count 2 each produce one strict genus-three solid and 23720 mm³. Independent both-cap openings and moments put the new center at (26, 9) and (4, 9) mm respectively. The later center stays at (11, 27) mm. Positive and negative X and Y, count, parameter edits, typed refusals, stable wall IDs and native Save/Open pass in the Kernel suite. No-source control repeats the later cut and yields 23680 mm³.
- **PASS — Model and Agent.** The explicit-source command records Subtract n4 and target n7 independently. Saved Model recipes keep both references, including through leaf ownership, renumbering and assembly flattening. Local command dispatch validates the current revision and refuses a zero spacing, Z axis or current cut named as the earlier cut. The previous Rectangular command and tool contract pass.
- **PASS — desktop Studio.** Browser and History give the same positive-spacing recipe. Invalid spacing refuses without changing the document or Undo history. The History editor changes +16 to −6 mm. The same original openings and refs survive Undo, Redo, native Save and fresh Open. Rectangular, Fill and Path controls retain their previous behavior.
- **PASS — verification.** 40 Kernel, 30 Model and 4 Studio tests. Kernel library, three type checks, scoped lint, Studio production build, driver syntax and Git diff check pass. Independent High review found a Model oracle gap. The Model test now verifies both lowered feature IDs. Three external mutations fail their target checks when the Kernel ignores the source, the Kernel loses the negative sign, or Model drops the source. The three actual desktop runs pass 7 Linear, 8 Rectangular and 16 Fill/Path checkpoints with zero page, console or source errors.
- **FAIL — corrected Model test input.** The first Model type check needed an explicit type for the invalid recipe fixture. The final focused tests and type check pass.
- **FAIL — inherited code-shape gate.** The known spread-minmax counts in three unchanged Kernel files remain.
- **NOT_RUN.** Whole local suites, mobile, other rendering backends, paid or remote Agent use, separate live MCP Linear proposal approval, wider earlier-cut families, and general path and dependency remapping. Overall CAD stays unmeasured. First mechanical CAD remains 8/10 accepted. #25 stays open.

## Reproduction

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,curve}-cut-pattern.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern linear-cut-pattern fill-cut-pattern curve-cut-pattern toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp
D1830_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --linear
D1828_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/rectangular-control"
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/other-pattern-control"
```

# D1832 — Repeat the direct earlier rectangular cut along a straight-segment Path

P1 rows 15 and 16. [Issue #25](https://github.com/barocss/cad/issues/25). Base `0f862122f83d26cb5606376f70607472e0343180`.

The retained D1831 desktop Path control refuses the earlier Subtract 1 on the same two-cut stock from Browser and History at both sizes. D1832 adds this direct earlier source while the current later Difference owns the target. The entire authored path must be open and in one exact XY plane. The existing degree-one polyline and exact straight degree-two midpoint spans both qualify. The source path follows fixed-orientation distance placement and the same native original-and-copy proof used by Fill. The existing no-source Path retains the curved, straight and three-dimensional paths it already supports.

- **PASS — native and Model.** A two-span path with a right-angle turn preserves the earlier and newer original holes. At 16 mm spacing and Count 3 its added centers are (26, 9) and (26, 25) mm. At 14 mm they are (24, 9) and (26, 21) mm. Both use 60 × 40 × 10 mm stock, one strict genus-four result, four apertures on each cap and 23640 mm³. Independent cap coordinates and moment calculations match. Tests verify both encodings, fixed orientation, stable wall IDs, exact authored level even at Count 1, unsupported path, unsafe offset and source ownership refusals. Model keeps the linked path in its supported base scope, preserves both feature references, remaps inline placed recipes and supports the revision-bound local command.
- **PASS — desktop Studio.** Sketch → Make curves creates the exact two degree-two straight spans. Path cut pattern applies the earlier tool from Browser and History with the same linked curve and current target. Distances beyond the path and overlapping placements refuse without a document or Undo change. Edit, Undo/Redo, native Save and fresh Open preserve the path and original references. Earlier straight-grid and mask controls still pass. A more distant consumed source still refuses.
- **PASS — verification.** 52 Kernel, 48 Model and 9 Studio tests. Kernel library, Kernel and Model type checks, scoped lint, driver syntax and Git diff check pass. The Studio production build includes the successful Studio type check. Independent High review confirms whole-path validation, separation and reference ownership. Three external mutations fail their target assertions when the Kernel ignores the source, the planner drops the exact level check, or Model drops the source. Desktop Studio passes 8 Path, 7 Fill, 7 Linear, 8 Rectangular and 8 farther-source control checkpoints with no page, console or source errors.
- **FAIL — corrected driver launch.** The first driver timed out waiting for a palette input after framing. The retry uses the visible Sketch action and explicitly sets the XY sketch plane. Its actual workflow and all controls pass.
- **FAIL — inherited code-shape gate.** The three known spread-minmax counts remain in unchanged Kernel files.
- **NOT_RUN.** Whole local suites, mobile, other rendering backends, paid or remote Agent use, live MCP Path proposal approval, curved and nonlevel earlier-source paths, general arbitrary earlier-source selection and general dependent-reference recovery. First mechanical CAD remains 8/10 accepted. Overall CAD remains unmeasured. #25 remains open.

## Reproduction

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path}-cut-pattern.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1832_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/studio"
D1831_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/fill-control" --fill
D1830_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/linear-control" --linear
D1828_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/rectangular-control"
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/farther-source-control"
```

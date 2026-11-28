# D2145 — Edit both distances of a saved Sketch Chamfer

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#171](https://github.com/barocss/cad/issues/171) · Base `284a5e1f3513237898439d8a6a792902c97f6997`.

Select the bevel of one saved two-distance Chamfer between perpendicular straight sides. Edit Chamfer opens the incoming and outgoing distances recovered from the stored bevel length and joint angle. The edit changes the two endpoints, bevel length and owned angle rule. The original carrier lines, side IDs and other constraints stay in place. The native document uses its existing polygon representation.

## Verification

- **PASS, actual desktop baseline.** The D2144 source opens and evaluates the 3 mm by 4 mm bevel at 11,940 mm³. Selecting edge 2 gives no dedicated Edit Chamfer action.
- **PASS, actual desktop candidate.** Edit Chamfer opens at 3 and 4 mm with Apply disabled. A preview at 6 and 4 mm retains the committed geometry. A 40 mm incoming value consumes its carrier and is refused. Cancel retains the original values. Applying only the incoming change gives endpoints (34, 0) and (40, 4), angle 146.30993247402023° and volume 11,880 mm³ on a 40 × 30 × 10 mm part. The next edit changes only the outgoing value from 4 to 8 mm. The result retains (34, 0), moves the other endpoint to (40, 8), and measures 11,760 mm³. Undo/Redo after each edit and native Save/fresh Open preserve the selected result. The independent native read verifies seven faces, ten vertices and the same named bevel wall.
- **PASS, affected checks.** 34 Model and 55 Studio tests pass. Both type checks, scoped ESLint, driver syntax, diff check and Studio production build pass with Node 22.19.0. The Model controls cover signed turns, reversed angle rules, precise numeric input, constrained endpoints and a neighboring saved equal-distance bevel. The separate desktop control passes the existing equal-distance editor. Baseline and candidate each freeze 1,281 files with zero source changes, page errors or console errors.
- **NOT_RUN.** Local Agent editing of a saved two-distance Chamfer, grouped unequal-distance editing, external CAD, mobile and full local suites. #171 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/baseline" --edit-baseline
TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/candidate" --edit
D1700_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/equal-control" --resize
pnpm --dir packages/barocss-cad-model test sketch-chamfer-edit sketch-chamfer-retention corner-batch saved-chamfer-agent-edit
pnpm --dir apps/cad-studio test constraints sketch-constraint corner
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

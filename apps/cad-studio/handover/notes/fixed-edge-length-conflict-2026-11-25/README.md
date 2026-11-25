# D1994 — Attribute straight edge length conflicts between two fixed endpoints in Sketch canvas and panel

P1 [row 9](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md), [#21](https://github.com/barocss/cad/issues/21). Base `28dd7f3d6331f4dd448e62f3a01699a3d5eeb45c`.

`fixedPointDistanceConflict` (`apps/cad-studio/src/sketch/constraintList.ts`) previously recognized only point-to-point distance keys (`dist`/`dx`/`dy`) and was called only from canvas inline dimension edits (`applyDimension`). Extending `fixedPointDistanceConflict` to straight closed-outline edges (`len<edge>`, non-arc, both endpoints non-anchor with unique explicit `Fix` rows) and invoking it from Sketch panel length recovery (`recoverPanelLength` in `studioSketchViewportActions.ts`) gives both canvas and panel edits consistent named diagnostics and clickable `Find fixed point` recovery actions.

- **Previous Studio (FAIL):** On a `40 × 20 mm` closed sketch with explicit `Fix` on point 2 `(40, 0)` and point 3 `(40, 20)`, entering `25` for `Edge 2` in the Sketch panel showed a generic conflict alert without naming the `20 mm` fixed-point span and offered no `Find fixed point 2` or `Find fixed point 3` buttons.
- **Actual Chrome PASS:** Entering `25` for `Edge 2` in the Sketch panel displays `Length of edge 2 = 25 mm conflicts with the 20 mm distance set by fixed points 2 and 3.` and exposes both `Find fixed point 2` and `Find fixed point 3` while leaving points, inputs and document unchanged. Clicking `Find fixed point 3` focuses and highlights `Fixed point 3` (`rule:1`) on both the constraint list and the 2D canvas. Explicitly removing `Fixed point 3` and entering `25` resizes the outline to `40 × 25 mm` (`Fixed point 2` retained at `(40, 0)`). `Finish sketch` rebuilds the `40 × 25 × 10 mm` native solid (`10,000 mm³` vs `8,000 mm³`, strict B-rep, genus 0); Undo/Redo and actual `.bcad` Save and fresh Open preserve both states cleanly.
- **Focused checks & regressions:** 16 Studio tests (`constraint-list`, `panel-opposing-length`), Studio `type-check`, scoped ESLint, driver syntax check, and actual Chrome regression replay of D1983/D350 (`sketch-conflict-proof-browser.mjs`) pass.
- **Remaining scope:** Curved/compound mobility diagnostics, broader constraint conflict attribution, and ellipse native limits remain open on [#21](https://github.com/barocss/cad/issues/21).

[Previous no Fix targets](studio/00-previous-no-fixed-point-targets.png) · [Named fixed-point conflict](studio/01-panel-fixed-edge-conflict.png) · [Focused Fixed point 3](studio/02-focused-fixed-point-3.png) · [Edge 2 resized to 25 mm](studio/03-edge-2-applied-25.png) · [Fresh Open 10,000 mm³](studio/05-fresh-open.png)

```sh
D1994_SOURCE_FROZEN=1 node apps/cad-studio/test/fixed-edge-length-conflict-browser.mjs /tmp/cad-d1994-studio
(cd apps/cad-studio && D350_SOURCE_FROZEN=1 node test/sketch-conflict-proof-browser.mjs /tmp/cad-d1994-reg-d350)
```

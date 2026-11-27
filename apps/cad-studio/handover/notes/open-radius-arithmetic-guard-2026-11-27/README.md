# D2043: Preserve open arcs when a typed radius cannot be represented

P1, [#21](https://github.com/barocss/cad/issues/21). On exact prior main `1445d5216`, changing the 20 mm-chord open R14 minor arc to `1e16` caused the computed sagitta to round to zero. Studio silently showed a 20 mm line where the arc had been, and the available radius Redo was lost. A major arc also takes a reciprocal, so an unrepresentable result must not reach its outline.

The converter now refuses degenerate/nonfinite inputs and zero, negative or nonfinite bulge results. The panel additionally refuses a nonfinite major-arc reciprocal. No new radius range, arc family or numerical solver is introduced. An invalid numeric entry leaves the arc, endpoints, draft history and committed model untouched.

## Desktop and native result

- Exact prior Chrome shows the radius field becoming an edge length without moving endpoints. Fixed Chrome refuses `1e16` and `1e308` while showing the R14 minor arc, and Redo still restores R16. The independent major-arc fixture keeps R12.5; Redo still reaches the exact R10 semicircle.
- Explicit close, 3 mm Extrude, strict native solid, Undo/Redo, Save and fresh Open pass in both fixtures. The minor case ends at R12.5 with analytic volume agreement; the major control ends at R10 with native volume 1671.238898038469 mm³.
- 16 focused Studio tests, 24 Model geometry/profile tests and the exact TypeScript 5.9.2 Studio check pass. This does not claim all very large finite radii are now supported.

[Prior: line substituted for arc](studio/01-prior-line.png) · [Fixed: original arc and Redo](studio/02-fixed-arc.png) · [Minor fresh Open](studio/03-minor-open.png) · [Major fresh Open](studio/04-major-open.png)

```sh
pnpm -C apps/cad-studio test open-terminal-arc-radius-history open-arc-radius-history draft-history
pnpm -C packages/barocss-cad-model test sketch-arc-canonical-source profiles-parameters
export OPEN_TERMINAL_ARC_RADIUS_HISTORY_SOURCE_FROZEN=1 D2040_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/open-terminal-arc-radius-history-browser.mjs /tmp/minor-radius --radius-overflow
node apps/cad-studio/test/open-semicircle-radius-history-browser.mjs /tmp/major-radius
# On exact prior product source 1445d5216 with the updated terminal driver, add --prior-overflow.
```

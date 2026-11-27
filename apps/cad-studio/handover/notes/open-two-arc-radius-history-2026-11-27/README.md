# D2039: Undo either radius in an open two-arc sketch

P1, [#21](https://github.com/barocss/cad/issues/21). After D2038, a single interior arc in a four-point open chain had its own numeric Undo. With a second arc, the Draft panel still changed the shown radii on the previous main, but did not record any numeric Undo. This delivery admits a single new, unconstrained five-point Line–Arc–Line–Arc ordering. The event proof compares every bulge slot and requires exactly one existing arc to change without changing sign, minor/major branch, endpoints, or owner metadata. Existing single-arc modes are unchanged. This does not add a driving dimension, solver, schema, or general chain support.

## Evidence

- Real Chrome 158: two unequal chords start at R12.5/R9.375. Edit to R14/R9.375 → R14/R10 → R16/R10. Three Undo and three Redo steps recover every exact radius pair while all five authored points stay unchanged. Entering impossible R7 on the 15 mm chord while Redo is available preserves both radii and Redo.
- Close and Extrude 3 mm. Strict native solid has two cylindrical faces, with independent radius and support-center checks. Analytic volume 1,449.396249839 mm³ agrees at the declared closed-sketch coordinate rounding tolerance. Extrude Undo/Redo, native Save, and fresh Open retain the result.
- Fourteen focused Studio tests and the Studio type check passed. The existing four-point interior arc is the desktop regression control.

[Prior missing Undo](studio/00-prior-undo-disabled.png) · [Undo first arc only](studio/01-undo-first-arc.png) · [Fresh Open](studio/03-fresh-open.png)

```sh
pnpm -C apps/cad-studio test open-terminal-arc-radius-history open-arc-radius-history draft-history
export D2039_SOURCE_FROZEN=1 OPEN_TERMINAL_ARC_RADIUS_HISTORY_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/open-two-arc-radius-history-browser.mjs /tmp/open-two-arc
node apps/cad-studio/test/open-terminal-arc-radius-history-browser.mjs /tmp/open-four-point-control --interior
# On the previous product source with the new driver only, add --baseline to the two-arc run.
```

More than two arcs, arbitrary edge order, linked or reopened sketch sources, and generic constraint repair remain outside this qualification. #21 remains open.

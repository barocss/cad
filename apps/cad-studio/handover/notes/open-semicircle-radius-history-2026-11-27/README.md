# D2040: Undo an exact semicircle radius edit in an open sketch

P1, [#21](https://github.com/barocss/cad/issues/21). In an independent open Line–Line–Arc, entering R10 on a major R12.5 arc with a 20 mm chord changed the actual curve to a semicircle, but the previous main left Undo disabled. The numeric edit now has its own draft history step. The existing geometry operation is unchanged. The admission still rejects a sign change or a direct major/minor flip at a non-semicircular radius.

## Desktop and native result

- Real Chrome: prior Undo was disabled after R10. Fixed Undo restores the R12.5 major outline and all four endpoints; Redo restores the R10 semicircle. Impossible R9 leaves the original major arc and Redo unchanged. No committed document changes until explicit closure.
- Finish, Extrude 3 mm, Undo/Redo, Save and fresh Open preserve a single strict native solid. Its cylindrical face has radius 10 and center (20, 30) in XY; actual and independent analytic volume are 1671.238898038469 mm³.
- 15 focused Studio tests and Studio type-check passed. The prior and fixed cases were recorded in separate source checkouts. The ordinary terminal minor-arc desktop flow is the unaffected control.
- Not covered: remembering a branch preference for later edits starting from a semicircle, driving constraints, existing edited/linked sketches, or arbitrary outlines.

[Prior](studio/00-prior-undo-does-not-restore-major.png) · [Undo](studio/01-undo-restores-major.png) · [Redo](studio/02-redo-restores-semicircle.png) · [Fresh Open](studio/05-fresh-open.png)

```sh
pnpm -C apps/cad-studio test open-terminal-arc-radius-history open-arc-radius-history draft-history
pnpm -C apps/cad-studio type-check
export D2040_SOURCE_FROZEN=1 OPEN_TERMINAL_ARC_RADIUS_HISTORY_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/open-semicircle-radius-history-browser.mjs /tmp/semicircle-fixed
node apps/cad-studio/test/open-terminal-arc-radius-history-browser.mjs /tmp/semicircle-control
# On previous product source 5ace64aca with the new driver copied in, add --baseline.
```

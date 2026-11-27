# D2042: Attribute Path cut pattern relink refusals to the feature

P1, [#760](https://github.com/barocss/cad/issues/760). History already allows changing the linked curve through the Path field. On exact prior main `6e88f2225`, a path that would overlap a later original through-bore was correctly refused, but the toast said “Direct geometry not changed” when the user edited the feature, not either source curve. The staged History candidate now titles the notice “Path cut pattern not changed” and keeps the existing detailed collision reason. Direct geometry operations and Fill notices keep their own labels. No kernel, path family, or file format change.

## Desktop and geometry

- On the D2035 mixed-cut plate, a quarter-arc pattern explicitly repeats the original Subtract `n4`. A second path that intersects the later R3 hole is refused from the History editor while Redo is available; the original document, geometry, cut ownership and Redo are all preserved.
- The straight vertical alternative is accepted through the existing History selector. Only the pattern's path reference changes at the same count and spacing; all authored source curves, originals and body references stay unchanged. The copied R2 wall moves to (10, 30). Undo restores the quarter-arc placement; Redo and fresh Open restore the vertical alternative. Strict native solid, analytic volume and centroid, and all untouched cut faces pass.
- 13 focused tests, the pinned TypeScript 5.9.2 Studio check, and the existing straight mixed History control pass. No broader curve reassociation, transformed or blind cuts, or downstream reidentification is inferred.

[Prior toast](studio/01-prior-toast.png) · [Fixed toast](studio/02-fixed-toast.png) · [Relinked](studio/03-relinked.png) · [Fresh Open](studio/04-fresh-open.png)

```sh
pnpm -C apps/cad-studio test direct-curve-candidate fill-pattern-candidate
pnpm -C apps/cad-studio type-check
export D2035_SOURCE_FROZEN=1 D2034_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs /tmp/path-relink --mixed --quarter --relink
node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs /tmp/path-relink-control --mixed --history
# On prior product source 6e88f2225 with this test driver copied, add --prior-relink to the relink run.
```

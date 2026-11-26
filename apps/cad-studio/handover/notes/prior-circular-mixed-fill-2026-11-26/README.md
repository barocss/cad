# D2033 — Repeat an earlier through-bore inside a Fill mask past later mixed cuts

P1, [#25](https://github.com/barocss/cad/issues/25). Follows [D2030](../prior-circular-mixed-grid-2026-11-26/README.md). Fill now shares the proven mixed-cut certificate for original upright stock and full-height original circular or rectangular cutters. It certifies exactly the cells emitted by the captured snapshot, not the complete candidate grid. Only the selected earlier cutter is copied. Path, blind or transformed cutters, and unsupported stock remain outside this change.

## Evidence

- The focused kernel regression reproduces the previous main's categorical refusal on a valid mixed Fill. With the change, a 60 × 40 × 10 mm plate retains the later R3 bore at (22,25) and the 4 × 2 mm through-rectangle. The original R2 at (10,10) stays even though its reference lies outside the mask. The captured cells add (18,10) and (18,18), not (10,18).
- In [desktop Chrome/WebGPU](studio/02-circular-fill-applied.png), Y spacing 12 puts the second row at (18,22), exactly tangent to the R3; 12.5 overlaps. Both refuse without changing the document or history. X spacing 16 also refuses against the rectangle. The independent kernel test shows a narrower mask may omit the tangent row and succeed.
- Editing Y spacing from 8 to 11 moves only the second-row copy to (18,21). Undo/Redo and [native Save / fresh Open](studio/04-fresh-open-circular-fill.png) pass. Independent cap and native-cylinder checks preserve both later openings and the original/copy face ownership. Strict B-rep: one closed solid, genus five; analytic volume 23,920 − 210π = 23,260.265542746 mm³.
- [Tangent refusal](studio/01-circular-conflict-12.png). Focused checks: 36 kernel tests, 31 Model tests, both mixed and existing single-later-rectangle flows on desktop Chrome 157 (Windows), and CAD Studio type check and production build. No broader closure of #25.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/prior-circular-*.test.mjs packages/barocss-cad/test/prior-path-cut-pattern.test.mjs
D1909_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome \
  node apps/cad-studio/test/prior-circular-fill-cut-pattern-browser.mjs /tmp/cad-fill-proof --mixed
```

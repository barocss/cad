# D2038: Undo an interior arc radius edit in an open sketch

P1, [#21](https://github.com/barocss/cad/issues/21). On the exact prior main, changing the radius of the middle arc in a four-point Line → Arc → Line open sketch changed the visible radius but left [Undo disabled](studio/00-prior-undo-disabled.png). End-arc history was already supported; the interior ordering was outside its admission rule.

The same draft-history route now admits this one additional ordering. Only the existing arc's bulge may change; endpoints, authored metadata, arc ordering and branch stay unchanged. No new constraint/solver or file schema, no new radius geometry, and no general multi-arc, joined, linked or reopened edit support.

## Verification

- Actual Chrome 158: radius 12.5 → 14 → 16 mm; [Undo restores 14 mm](studio/01-undo-radius14.png), Redo restores 16 mm. Further Undo/Redo keeps the radius edits separate from placement of the last line. Impossible R9 for a 20 mm chord changes no endpoints, radius, or draft history.
- Explicitly close at R12.5 and Extrude 3 mm; strict single native solid matches the independently derived volume 1,409.669633438 mm³ and cylinder radius, center and endpoints. Geometry is preserved through Extrude Undo/Redo, Save and [fresh Open](studio/02-fresh-open.png).
- The prior-source reproduction, fixed interior case, and existing terminal-arc desktop control passed their respective assertions. Thirteen focused Studio tests and type check passed. #21 stays open for broader sketch constraints, sources and conflict recovery.

```sh
pnpm -C apps/cad-studio test open-terminal-arc-radius-history open-arc-radius-history draft-history
export OPEN_TERMINAL_ARC_RADIUS_HISTORY_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/open-terminal-arc-radius-history-browser.mjs /tmp/open-interior-arc --interior
node apps/cad-studio/test/open-terminal-arc-radius-history-browser.mjs /tmp/open-terminal-arc-control
# On the prior product source with the driver copied, use --interior --baseline.
```

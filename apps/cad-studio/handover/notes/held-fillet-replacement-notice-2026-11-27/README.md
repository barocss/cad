# D2046: Retire a stale edge-refusal notice in held Fillet repair

P1, [#20](https://github.com/barocss/cad/issues/20). Public base `90d3b5feec5fd664cdec916bec9cf9d0bcef3fee`. In History's Replace edge for a held variable Fillet, clicking the top face correctly refused the pick, but the “Edge not selected” notice stayed above the now-valid replacement and enabled Apply after the next edge click. Route this refusal through the existing replacement-owned notice path. A valid pick or Cancel retires only that notice; geometry, pick eligibility, file format and reference matching are unchanged.

## Verification
- Real desktop Chrome, terminal R1→R3 Fillet on a 30 × 12 × 20 mm box: wrong face is refused without committing, valid edge retires the notice and preserves original Start/End radii, and Cancel after a second wrong pick retires the notice with document and history unchanged. Replacing the edge only commits on explicit Apply.
- Native strict geometry, Undo/Redo and actual Save/fresh Open: source edge spans (0,0,20) to (30,0,20), retain R1 and R3 at the ends, with native volume 7172.101761241656 mm³. Independent expected volume is 7200 − 130(1 − π/4). The adjacent held Chamfer refresh flow is the desktop control.
- 28 focused Studio tests and the Studio type check with CI-pinned TypeScript 5.9.2 pass. This does not extend the supported recovery or close the general topology/reference issue.

[Before](studio/02-prior-stale-refusal.png) · [After](studio/02-new-pick-no-stale-refusal.png) · [Fresh Open](studio/05-fresh-open.png)

```sh
pnpm -C apps/cad-studio test held-finish-replacement drawing-notice-lifecycle candidate-references
pnpm -C apps/cad-studio type-check
export HELD_VARIABLE_FILLET_FROZEN=1 D1991_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/held-variable-fillet-replacement-browser.mjs /tmp/held-notice --wrong-pick-notice
node apps/cad-studio/test/held-finish-history-refresh-browser.mjs /tmp/held-notice-control
# On the previous SHA with this driver copied in, add --prior-notice to the first Chrome run.
```

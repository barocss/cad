# D2031 — Recover a held Shell with a second independent body present

P1, [#20](https://github.com/barocss/cad/issues/20). Extends [D2001](../held-shell-face-pick-2026-11-25/README.md) without relaxing the single-opening, verified-planar or explicit-confirmation conditions.

A held Shell can resolve its own visible passthrough output when one separate ordinary rectangular Extrude is also present. The resolver proves the current output/ref and the Shell or suppressed downstream finish lineage, admits only the unique planar face on that mesh, and uses the actual viewport body slot for pick and preview. A name on another body, mismatched mesh revision, hidden owner, ambiguous output, active downstream output or an assembly occurrence is not a valid candidate. The companion output is not selected or modified by the operation. More than two outputs, non-rectangular or linked companion producers, multiple openings, and arbitrary or curved replacements remain outside this proof.

## Evidence

- **Desktop Chrome/WebGPU:** [previous main](studio/00-prior-two-body-refusal.png) withheld the picker with two outputs. Current main-source test puts the independent block before the Shell body in the evaluated array and confirms that [clicking its planar face](studio/01-other-solid-refused.png) refuses without changing the document or Undo/Redo. [Clicking the intended 360 mm² face](studio/02-own-face-preview.png) highlights only that face; Cancel has no effect on either body.
- **Explicit steps:** Apply opens only the U-block Shell (2 mm wall), replacing the retired opening with `n1.side[s1]`. The downstream Chamfer stays held while its candidate refreshes and requires separate confirmation. Two Undo/Redo steps and native [Save and fresh Open](studio/03-fresh-open.png) restore both results. The independent 2,304 mm³ block has exact identical strict B-rep through all inspected states, including reopen.
- **Regression:** 17 focused Studio unit tests; desktop single-output picker; original single-output Shell reference-panel preview and downstream re-verification; scoped lint, Studio type-check and production build. An earlier harness order assertion showed the evaluator follows authored feature order, not output-object order. The final fixture explicitly places the rectangular extrusion first.

```sh
pnpm -C apps/cad-studio test held-shell-face-replacement held-shell-candidate-preview reference-decisions held-draft-face-replacement
D2001_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome \
  node apps/cad-studio/test/held-shell-face-pick-browser.mjs /tmp/held-shell-two-bodies --multi
```

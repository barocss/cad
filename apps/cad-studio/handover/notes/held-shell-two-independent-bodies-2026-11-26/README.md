# D2032 — Recover a held Shell between two independent extrusions

P1, [#20](https://github.com/barocss/cad/issues/20). [D2031](../held-shell-independent-body-2026-11-26/README.md) already covers one independent extrusion. With two present, the [previous Studio](studio/00-prior-three-body-refusal.png) opened the valid held document but did not offer **Replace face** in the Shell History editor.

The bounded resolver now admits a held single-opening Shell and up to two ordinary independent rectangular Extrudes, requiring one visible Shell lineage and distinct solid producer references across every output. Duplicate producers or keys, unmatched owners, a fourth output, multi-opening Shells, curved replacements, dependent companion producers and assembly occurrences remain outside this contract. No schema, native kernel or rematching change.

## Evidence

- Desktop Chrome/WebGPU at 1440 × 1000: the owner occupied the middle evaluated slot. Real clicks on the [right companion](studio/01-foreign-body-refused.png), [left companion](studio/01-second-foreign-body-refused.png) and noncandidate owner face refused without changing document or history. A click on the [360 mm² planar opening](studio/01b-picked-shell-face-preview.png) enabled Apply only for the intended face. Cancel changed neither model nor history.
- Explicit Apply opened the 2 mm Shell at the selected face. Downstream Chamfer stayed held until separately confirmed. Both edits survived two Undo/Redo steps and [native Save / fresh Open](studio/04-fresh-open.png).
- Native inspection checked strict B-rep validity for all three bodies. Both independent solids, at 2,304 and 1,680 mm³, remained exactly identical (native B-rep deep equality) through application, history and reopen. Shell volume agreed with the fixture's analytic 14,642.2654824574 mm³. Neither this case nor D2031 closes #20.
- 18 focused Studio tests include both foreign viewport slots, stale mesh, a companion producer alias, a duplicate Shell lineage and the fourth-output refusal.

```sh
pnpm -C apps/cad-studio test held-shell-face-replacement held-shell-candidate-preview reference-decisions held-draft-face-replacement
D2001_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome \
  node apps/cad-studio/test/held-shell-face-pick-browser.mjs /tmp/held-shell-three-bodies --three
```

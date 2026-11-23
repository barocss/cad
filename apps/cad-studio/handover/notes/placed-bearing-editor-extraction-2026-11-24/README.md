# D1868 — Extract the placed bearing editor from App

P4 [row 16](../../roadmap-rows/16.md) and [row 22](../../roadmap-rows/22.md), [#44](https://github.com/barocss/cad/issues/44). Base `a06dd0d3dd1296cfda345ad103e1c008e35abd5b`. Small Studio refactor. App shrinks from 2825 to 2799 lines.

The placed bearing hook owns the edit address, validation lane, pending state and selection-based retirement. App retains the accepted assembly and its Undo transaction. The same source object still backs the root command-preview and History ownership checks. The existing Assembly Steps selection guard reads the hook's pending state.

- **PASS, actual desktop Studio.** Two occurrences use the same authored fitting. Select the one at [12, 3, 4] mm, choose the physical housing and hold the real successful validation. Selecting its peer at [95, 3, 4] mm retires the reply. The accepted document and displayed bounds stay exact, and the peer remains selected. A fresh Apply changes only the intended occurrence. Undo, Redo and native Save/fresh Open retain the exact state.
- **PASS, affected model evidence.** The chosen reference is `inst1/b1`. The native report gives a covered 47 mm housing bore and both bearing volumes remain 19800.652218059 mm³. The second occurrence has no housing. The accepted child keeps its local placement and does not store inherited fit or bearing tables.
- **PASS, shared History control.** The root Revolve axis can still be replaced through History with the original owned edge workflow. Four bearing edit states and six History control states pass. 14 focused Studio tests, scoped lint, both type checks and Studio production build pass.
- **FAIL, first browser check.** Startup exposed an Assembly Steps reference to the removed local pending variable. The final check reads the hook's pending state and Studio starts normally.
- **FAIL, pre-existing peer viewport defect.** A Top-view probe hits three exposed points on the unchanged peer bearing before Apply and misses all three afterwards. The probe fails identically on the unmodified App and the extracted App. The exact peer model and bearing report are retained. Fresh Open restores its visible ring. D1869 isolates the active scene result before widening the scope.
- **NOT_RUN.** Other renderer or mobile flows, full local suites and a change to any other assembly workflow. #44 remains open at 211/220. The first mechanical CAD baseline stays 8/10.

```sh
D1868_SOURCE_FROZEN=1 node apps/cad-studio/test/placed-bearing-editor-browser.mjs "$OUT/bearing"
D1164_SOURCE_FROZEN=1 node apps/cad-studio/test/revolve-history-axis-browser.mjs "$OUT/history-axis"
pnpm --dir apps/cad-studio test bearing-edit command-build-failure reference-focus
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
```

Use `--peer-view` with the D1868 driver to run the separate failing viewport-pick probe.

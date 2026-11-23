# D1869 — Keep a shared placed surface alive through selection changes

P0/P4 [row 10](../../roadmap-rows/10.md), [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `0aa042706a20632127ac21dc5133de059de08651`. Small WebGPU viewport repair for shared placed geometry.

A placed body owns its shared shape for its time in the scene. A temporary private surface may show its current pick colour or appearance. Returning to the shared surface must use the same live geometry. Dropping a placed body releases its shape only after that body's surfaces and edges are removed. Both the private and the shared routes release their final resources.

- **FAIL, original desktop Studio.** Switching edit ownership and applying a valid housing changes one placed occurrence. The unrelated ring is visible before Apply and three of its Top-view samples return its exact owner, body and face. All three miss after Apply. The selected occurrence and saved native report are valid. The peer ring's source extents remain X71.5–118.5, Y−20.5–26.5 and Z20–34 mm. The actual renderer shows a disposed shared geometry with one drawing consumer after the switch.
- **PASS, fixed desktop Studio.** The same held validation, selection change, housing Apply and native Undo/Redo run successfully. The three ring samples retain the original `inst3` body 1 and face 4 before Apply, after Apply and in a fresh context after project Open. The selected housing link, transforms and exact peer geometry remain unchanged by rendering.
- **PASS, focused resources.** The edge-free shared surface survives transfer between two selected copies and single-owner temporary private drawing. Removing both private and shared users releases the one shared surface and the private surfaces exactly once. The first isolated regression received a mesh that its placement helper had already moved. The corrected fixture copies its mesh buffers and reproduces early disposal on the parent.
- **PASS, affected checks.** 11 focused Studio tests, scoped lint with the existing viewer recovery console warning, Model types and Studio production build. The 24-bracket WebGPU control yields 257 hits from 400 rays with no sharing-on/off disagreement. The maximum hit gap is 5.351e−12 mm. No pixel exceeded the retained colour threshold in 1,026,000 pixels. The edited bracket gets its own geometry and the other 23 keep theirs.
- **NOT_RUN.** Whole local suites, other rendering backends, mobile and broad scene changes. #44 remains open at 211/220. First mechanical CAD stays 8/10.

```sh
pnpm --dir apps/cad-studio test instance-pose viewport-pick bearing-edit
D1868_SOURCE_FROZEN=1 node apps/cad-studio/test/placed-bearing-editor-browser.mjs "$OUT/peer" --peer-view
FLOW_ONLY='^G10: 24 copies' node apps/cad-studio/test/browser-flow.mjs "$OUT/24-copies"
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
```

# D2212 — Set the inner corner and floor thickness of one top-open L Shell

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `2b1aac2af`.

Separate floor retains the Inner corner control for the exact original top cap of one upright orthogonal L extrusion. The model stores both existing fields in the Shell feature. History edits each value independently. The same command accepts a revision-pinned Agent request for the exact original cap.

Sharp builds the cavity from the six inset planar supports of the certified L and begins it at the authored floor height. Round uses the existing exact rounded cavity and preserves the default native bytes. The result must have one strict solid, one top rim, one floor and the original exterior supports.

- **PASS, actual desktop Studio.** In the original build, switching from Sharp to Separate floor hid the control and applying saved the default Round. The revised 40 × 30 × 20 mm part with 2 mm side walls and a 3 mm floor previewed and applied Sharp at 7,080 mm³. Preview and Cancel preserved the stock. A 20 mm floor refused Apply. History changed the floor to 5 mm with a Sharp volume of 8,280 mm³, then changed only the corner to Round at 8,267.123890 mm³. Undo/Redo and project Save → Close → reload → Open restored the accepted result. Changing the reopened corner to Sharp preserved the 5 mm floor. The existing Default flow also passed. Each run froze 1,292 sources and reported zero page errors, console errors or downloads.
- **PASS, native and affected checks.** 42 emitted Kernel, 19 Model and 16 Studio tests. The independent checks cover strict topology and pcurves, volume, area, centroid, material rays, directed tessellation, reflected and reversed L boundaries, named supports and native persistence. Explicit Round matches the default native bytes. Kernel, Model and Studio types, scoped lint, driver syntax, whitespace and the Studio Vite build passed.
- **FAIL, first native test assertions.** They first expected an exact generated name, then counted the Round cylinder under the same native name stem as a planar wall. The passing assertion selects the planar support and checks the cylinder separately.
- **FAIL, existing code-shape guard.** It reports eight entries. Its script, baseline and all five input directories match the parent exactly.
- **NOT_RUN.** Other opening sides, arbitrary stock, freeform Shell, full local suites and mobile. #13 remains open for its broader scope. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{part-l-shell-floor,part-closed-l-shell-join,part-shell-walls,part-corner-shell-walls}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-corner shell-walls chord-shell revision-pinned-edit
pnpm --dir apps/cad-studio test failed-feature opening-shell-failure command-preview
TOP_L_SHELL_FLOOR_FROZEN=1 node apps/cad-studio/test/top-l-shell-floor-browser.mjs "$OUT/desktop-corners" --corner
TOP_L_SHELL_FLOOR_FROZEN=1 node apps/cad-studio/test/top-l-shell-floor-browser.mjs "$OUT/desktop-default"
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

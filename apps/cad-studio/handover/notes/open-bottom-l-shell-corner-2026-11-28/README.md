# D2118 — Choose the inner corner of an open-bottom L Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `ec40f6a35187ddae4b6e86968b20e9fb893ad03d`.

Uniform Shell offers Default, Sharp and Round when the original bottom cap of an upright orthogonal L extrusion is the single opening. The shared signed cap check verifies the connected lower rim, the intact original upper cap and the interior ceiling at the requested wall distance. The existing slab producer supplies the native geometry.

- **PASS, baseline and archive.** In actual Studio, a Bottom-view cap pick opens `n1.bottom`. The previous command offers only the wall control. Its default 2 mm result has native volume 5,936.5486677646195 mm³. Reopening that exact archive in the candidate retains native digest `43ef94d472d8a93cbf7d696051d559fd82ebfd1e037f5ee0baa80cdf3ab89fad`.
- **PASS, actual desktop.** Sharp previews, cancels and applies, keeping the original bottom face signature. History refuses 5 mm with the accepted part retained. The Round edit, Undo, Redo, native Save and fresh Open retain the exact result. Looking from below shows the original opening. Native readback confirms one outer and one inner loop at Z = 0, the interior ceiling at Z = 18 mm and the intact top at Z = 20 mm. The existing top-opening manual control and revision-bound local Agent control also pass. All four runs report zero source changes, runtime errors and console errors.
- **PASS, independent native geometry.** At a 2 mm wall, Sharp yields 5,952 mm³ and Round yields 5,936.548667764616 mm³ by the same independent inset-area calculation as [D2116](../open-top-l-shell-corner-2026-11-28/README.md). Native differences are below 4 × 10⁻¹² mm³. Both are strict single-shell solids. Round has an exact radius-2 mm cylinder and rim arc. Tests cover reversed loops, tagged sides, shifted stock, a changed wall, cold reload, ray checks of the intact top and open underside, and unrelated opening refusals. Eight earlier native hashes match.
- **PASS, affected checks.** 61 Kernel, 48 Model and 66 Studio tests, Kernel emit, three type checks, scoped ESLint, driver syntax, production build and diff check on Node 22.19.0.
- **FAIL.** None unexpected in the selected baseline, desktop or affected checks.
- **NOT_RUN.** Local Agent approval for the newly supported bottom opening, side or multiple openings, earlier readers of the new recipe, full local suites, mobile and live providers. [#13](https://github.com/barocss/cad/issues/13) stays open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while actual Chrome runs.
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/baseline" --open-bottom --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/candidate" "$OUT/baseline/legacy-round-native-doc.bcad" --open-bottom
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/top-control" "$TOP_LEGACY_FILE" --open-top
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/agent-top-control" --open-top
node --test --test-concurrency=1 packages/barocss-cad/test/{r11-1,r11-1b,r11-1c,box-shell,capsule-shell,part-shell-walls,part-adjacent-shell-walls,part-opening-pair-shell-walls,part-tube-shell-walls,part-closed-l-shell-join,api-part}.test.mjs
pnpm --dir packages/barocss-cad-model test shell migrate toolset tool-contract proposals
pnpm --dir apps/cad-studio test shell toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

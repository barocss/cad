# D2115 — Draft the original wall of a cylinder on an explicit XY plane

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `93fab81c27ea6f77d6e352d095ea360db3cb1059`.

The original circle Extrude on an explicit cardinal XY sketch plane now supports complete wall Draft along ±Z. The kernel verifies the authored frame and the exact native placement. The XY extrusion materializes its cap charts in world Z, so the existing circular wall producer uses its exact trim comparison there. The signed X/Y route keeps its existing placement proof. The Model uses the same source check for selection and saved History.

- **PASS, baseline reproduction.** Desktop Chrome selects the original curved wall of a translated XY cylinder. Draft reports that it requires flat side faces. The accepted source remains intact.
- **PASS, actual desktop.** An XY sketch at (10, 20, 30) mm extrudes its radius-10 mm circle from world Z = 33 to 53 mm. The world axis is through (22, 13). Draft at Z = 41 mm previews, cancels and applies at +10°. A +44° History edit refuses axis collapse. Editing to −10°, Undo, Redo, native Save and fresh Open preserve the accepted geometry and original native incidence. A second actual run switches the saved Draft from Body end to a fixed coordinate. Its default is 33 mm and its interior edit to 41 mm passes the same History and native reload. The three desktop runs retain 1,273 source files with zero source changes, runtime errors or console errors.
- **PASS, independent native geometry.** The reference uses `R(z) = 10 − tan(θ)(z − 41)`. At +10° and −10° the independent volumes are 5,912.958606927207 and 6,799.274682484619 mm³. Native discrepancies stay below 5 × 10⁻¹² mm³. The independent axial centres are Z = 41.794935208007374 and 44.12459588941208 mm. Native cases include eight exact XY frame orientations in 32 signed combinations, the previous 64 non-XY combinations, fixed end-cap records, strict closed topology and cold reopen. Six prior native hashes match. Partial or duplicate wall picks, noncardinal authored axes, a separate Move and axis collapse refuse.
- **PASS, affected checks.** 134 Kernel, 38 Model and 88 Studio tests, Kernel emit, three type checks, scoped ESLint, driver syntax, production build and diff check on Node 22.19.0.
- **FAIL.** No unexpected failures in the selected product or affected checks.
- **NOT_RUN.** Desktop tests of the other signed XY bases, arbitrary planes, archived partial-wall recipes, broader Draft families, full local suites, mobile and live providers. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured. The wider issue stays open.

```sh
# Node 22.19.0. Use the heavy gate. Freeze sources while Chrome runs.
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/baseline" placed-z --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/candidate" placed-z
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/history" placed-z --history-neutral
node --test --test-concurrency=1 packages/barocss-cad/test/{draft-cardinal-circular-wall,draft-circular-wall,drafted-extrusion,drafted-cap-offset,bored-cap-offset,circular-wall-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command draft-angle offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

# D2113 — Restore the original cap when editing cylindrical Draft

P1 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `1f5290bee97b488284cce823a9975ec306578e31`.

When an existing cylindrical Draft changes from Body end to Fixed coordinate, the full History editor starts at the original cap. It resolves the saved parent in the feature prefix, verifies both native wall halves and reads the two exact cap coordinates. It chooses the lower coordinate for positive pull and the upper coordinate for negative pull. A mismatched pull or incomplete wall still has no default. The initial Draft tool and the full editor share the authored source admission.

- **PASS, baseline reproduction.** Desktop Chrome applies a +10° Draft from the YZ cylinder's body end and opens the same feature in History. Switching to Fixed coordinate leaves the input empty and shows `Neutral coordinate is empty.` The document retains the original automatic Draft.
- **PASS, actual desktop candidate.** The switch defaults to X = 13 mm on the YZ cylinder and Z = 3 mm on the existing XY cylinder. A change to X = 21 mm or Z = 11 mm previews and cancels without changing the accepted document. Apply, Undo and Redo restore the appropriate neutral input. Native Save and fresh Open match the fixed input, original incidence and B-rep digest. Independent mass and centre checks pass. The YZ native volume is 5,912.958606927209 mm³ against the independent 5,912.958606927207 mm³. Each run retains 1,272 source files with zero source changes, runtime errors or console errors.
- **PASS, affected checks.** Model verifies signed cap defaults at X = 13 and 33 mm, volume equality after explicitly choosing the same cap, and no default for a wrong pull axis or single half-wall. All 37 Model and 88 Studio tests, both type checks, scoped ESLint, driver syntax, production build and diff check pass on Node 22.19.0.
- **FAIL, corrected checks.** The first type check required a guard for an optional native face name. The first desktop candidate completed native fresh Open but the final assertion used an editor locator from the previous browser context. The corrected run resolves the reopened editor from the current page.
- **NOT_RUN.** Separate XZ and negative-pull desktop runs, arbitrary planes, archive recovery of incomplete walls, full local suites, mobile and live providers. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured. The wider Draft issue stays open.

```sh
# Node 22.19.0. Use the heavy gate. Freeze sources while Chrome runs.
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/baseline" axial-x --history-neutral-baseline
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/candidate-final" axial-x --history-neutral
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/xy-control" --history-neutral
pnpm --dir packages/barocss-cad-model test draft-command draft-angle offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```

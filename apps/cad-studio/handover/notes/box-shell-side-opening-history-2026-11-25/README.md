# D1939 — Change a uniform box Shell opening to any original side in History

P1 [row 7](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md), [#13](https://github.com/barocss/cad/issues/13). Base `76649bee4208d9a5c6550a47911f959c2fe9f017`. Feature change.

The existing Uniform Shell History field offers Left, Right, Front and Back in addition to Closed, Top and Bottom. Apply checks the six native planar faces and the whole original rectangle extrusion. It verifies face names, supports, centroids, directions and areas, then writes the one selected opening signature. The existing separate Wall edit and exact parent and full-recompute ownership checks apply. The original Shell operation and saved representation stay the same.

- **PASS, actual desktop Studio.** Changed the existing Closed Shell to Right, Back, Left and Front, then Closed. Each mode passed Undo/Redo and fresh Open. A simultaneous wall and opening change was refused. An invalid standalone thickness left the accepted document intact. Cancel retained the accepted side opening. A held native prefix or full-evaluation reply could not apply after Cancel or document replacement in four desktop groups. The earlier desktop baseline offered only Closed, Top and Bottom.
- **PASS, independent native geometry.** 40 × 30 × 20 mm stock with a 2 mm wall retains 8192 mm³ for the left and right openings and 7872 mm³ for the front and back openings. The exact area left in the open plane is 184 or 224 mm² respectively. The oracle sums the real native planar strips around the side opening and checks exterior and cavity support locations, areas, strict native validity and the expected centroid. It compares the same volume with the Studio Worker.
- **PASS, affected checks.** Five Model and 31 Studio tests, including all 42 different opening transitions, borrowed or stale faces, and existing History ownership guards. Model and Studio types, scoped ESLint and Studio production build pass. The final source-frozen desktop run includes 28 checkpoints.
- **FAIL, corrected intermediate harness assumptions.** The first browser oracle expected the cap's single ring face on a side opening, where the existing kernel emits four coplanar strips. The next run reached the late full-reply check and used the old location of the inspector's volume field. The final driver checks the actual side area and the current mass result.
- **NOT_RUN.** Arbitrary side selection with multiple openings, per-face side thickness mode, non-cardinal stock, new STEP qualification, full local suites and mobile. The broader #13 scope remains open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
SHELL_OPENING_HISTORY_SOURCE_FROZEN=1 node apps/cad-studio/test/shell-opening-history-browser.mjs "$OUT/studio" --sides
node packages/barocss-cad-model/scripts/test.mjs shell-opening-history shell-walls
node apps/cad-studio/scripts/test.mjs shell-opening-history
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The previous Studio control uses `--side-baseline`. The run uses the existing installed desktop browser and keeps test scenes and receipts outside Git.

A second source-frozen desktop run reopened the four accepted files. It captured and verified a direct view of each original side opening.

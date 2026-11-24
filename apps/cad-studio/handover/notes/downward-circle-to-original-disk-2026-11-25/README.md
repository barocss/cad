# D1958 — End a downward circular Extrude at the original upper disk

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md). [#222](https://github.com/barocss/cad/issues/222). Base `5585f04b54ab7fed985531ea60607d29579add80`. Full geometry change in Model.

A literal circle on the exact −Z XY frame can use the original upper disk of one forward, upright, zero-draft circular Extrude. An exact native cap check verifies the target disk. The downward native probe uses its reached cap and verifies the Z station. The squared-distance test certifies the entire represented disk and refuses tangency. The feature uses the existing schema 3 recipe and derives its height from the current target.

- **FAIL, previous Studio.** Selecting the original upper circular disk refused because the downward guard required rectangular stock.
- **PASS, desktop Studio.** Pick the original upper disk, preview and apply. Target heights −5, 20 and 25 mm refuse without changing the accepted document, bodies or history. Edit the target height from 5 to 8 mm, Undo, Redo, Save, fresh Open and edit again. A tangent 18 mm source diameter refuses after Open. A valid 15 mm edit applies. Existing downward-to-rectangle and upward-to-annulus controls pass in desktop Chrome.
- **PASS, independent geometry.** The target disk has centre (10, 10) mm and radius 10 mm. The translated and reflected source has world centre (11, 10) mm and radius 8 mm. Its disk fits because 1 + 8 < 10 mm. Its bounding square has corners outside the target. Target heights 5 and 8 mm give travels 15 and 12 mm and source volumes 960π and 768π mm³. Native source centroids are (11, 10, 12.5) and (11, 10, 14) mm. Exact cap names, outward normals, and the retained target B-rep pass.
- **PASS, affected checks and reader compatibility.** 57 Model tests, one Studio test, Model and Studio types, Studio production build, scoped ESLint and diff check. The previous reader accepts the saved downward-to-rectangle control and explicitly refuses the new circular target recipe before replay.
- **FAIL, existing independent test.** The expanded Model run was 74 PASS and one FAIL. The Sweep test expected its old combined path and representation label. The same test fails with the exact base Extrude module and unchanged test source. This does not change the Extrude evidence. D1959 tracks the stale assertion and its actual Studio control.
- **NOT_RUN.** Downward-to-annulus, arbitrary target frames, multiple-body or occurrence targets, STEP, full local suites and mobile. #222 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD stays unmeasured.

```sh
D1958_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/prior" --disk --baseline
D1958_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/studio" --disk
D1932_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/rect-control" --circle
D1861_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/annulus-control" --circle
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude face-commands
node apps/cad-studio/scripts/test.mjs extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The prior-reader check substitutes the exact base `faceEndExtrude.ts` in the unchanged reader. Evidence files stay outside Git.

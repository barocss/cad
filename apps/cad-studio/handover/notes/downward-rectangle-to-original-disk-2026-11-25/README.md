# D1964 — End a downward rectangular Extrude at the original upper disk

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md). [#222](https://github.com/barocss/cad/issues/222). Base `6a98bd64003d7ef0ba1be6801d188330ff7ce1b3`. Full geometry change in Model.

A literal rectangle on the exact −Z XY frame can use the original upper disk of a forward, upright, zero-draft circular Extrude. The existing native cap classifier and reflected four-corner test certify the disk clearance. The existing schema 3 recipe derives the travel from the live named face.

- **FAIL, previous Studio.** The original upper disk selection refused a downward rectangle.
- **PASS, desktop Studio.** Preview and apply to the original upper disk. A reversed, coincident or unreachable target refuses while preserving the accepted part and History. A height edit from 5 to 8 mm changes travel from 15 to 12 mm. Undo, Redo, Save, fresh Open and another target edit pass. Setting the reopened rectangular edge length to 6 mm reaches exact corner tangency and refuses. A valid 4 mm edit applies.
- **PASS, independent geometry.** The initial reflected footprint is [10,15] × [14,18] mm on the R10 disk centred at (10,10) mm. The far corner distance is √89 mm. At width 6 mm the distance is exactly 10 mm. A width 1e−6 mm inside is accepted, and contact and outside corners within the bounding square refuse. Initial and rebuilt volumes are 300 and 240 mm³. After Open and the 6 mm target height edit, the shorter width gives 224 mm³ at centroid (12,16,13) mm. All eight vertices, the reached cap normal, and the original target B-rep pass.
- **PASS, current controls and compatibility.** Actual downward circle-to-disk and rectangle-to-box controls pass. Seven circular native records match D1958 exactly. The previous reader accepts both controls and refuses the new rectangle-to-disk recipe before replay.
- **PASS, affected checks.** 77 Model checks, one Studio check, affected types, Studio production build, scoped ESLint and diff check.
- **FAIL, corrected driver.** The initial driver expected a raw Width input. A reopened rectangle has a driving edge-length field. The final driver checks that field and verifies the compact rectangle and exact native rebuild.
- **NOT_RUN.** General downward profiles, annular upper targets, STEP, full local suites and mobile. The Sketch Finish refusal notice can still remain after successful Finish. #222 stays open. First mechanical CAD remains 8/10. Overall CAD stays unmeasured.

```sh
D1964_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/prior" --rectangle-disk --baseline
D1964_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/studio-final" --rectangle-disk
D1958_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/circle-control" --disk
D1896_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/box-control"
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude face-commands profiles-parameters
node apps/cad-studio/scripts/test.mjs extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The prior reader uses the unchanged migration entry with the exact base `faceEndExtrude.ts` guard. Evidence files stay outside Git.

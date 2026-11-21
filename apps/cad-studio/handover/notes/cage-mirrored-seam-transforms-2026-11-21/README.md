# D1500 — Verify SubD scale and face-normal rotation at a mirrored seam

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base `db64d482dd2612cbb1de268f97bcdb5bf05f4aa8`. The existing transform path passes this fixture. This decision adds a browser regression and changes no product source.

## Desktop case

Create a 30 × 20 × 16 mm SubD box with four quads per side. Keep the positive X half and mirror across X=0. Pick the one top quad with corners `[0, 0, 16]`, `[7.5, 0, 16]`, `[7.5, 5, 16]` and `[0, 5, 16]`. For each operation, start from the same mirrored cage and use unselected vertex 44 at `[7.5, 10, 16]`.

- **PASS, actual desktop Studio and independent coordinates.** The 1.1× uniform scale and +15° face-normal rotation matched independent affine and planar calculations respectively. The oracle replaces the two original seam X coordinates with exactly zero. Both would have left X=0 without that constraint, and both moved along Y. Every unselected coordinate, face, crease and selection was unchanged. Maximum coordinate error was 0 mm in each run against a limit of 1e-10 mm.
- **PASS, history and native files.** Escape and late release preserved the original cage and document. One release added one cage step. Cage Undo and Redo restored the exact states. Numeric entry matched the drag exactly. Each accepted direct drag passed Done, document Undo/Redo, native Save and fresh Open with the same cage, X mirror and one evaluated body.
- **PASS, affected tests.** 30 Studio tests, 14 Model tests, browser syntax and Git diff checks.
- **FAIL, initial harness checks.** The first two attempts stopped before picking a face. The Studio Top camera uses a small pitch offset, so a 16 mm depth span exceeded a fixed 0.02 CSS px threshold. The final harness checks the projected depth per mm relative to the projected X unit and frames both the selection and pivot.
- **NOT_RUN.** Other mirror planes, open cages, final surface dimensions, other renderers, mobile and full local suites. Product types/build were unchanged and were not rerun for this test-only decision. #625 stays open.

Use Node 22.19.0, installed desktop Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft cage-commit-readiness gizmo gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-rotation
node --check apps/cad-studio/test/cage-mirror-transform-browser.mjs
git diff --check
cd apps/cad-studio
CAGE_MIRROR_TRANSFORM_FROZEN=1 node test/cage-mirror-transform-browser.mjs "$EVIDENCE"
```

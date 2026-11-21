# D1501 — Verify SubD transforms on an open boundary and a single vertex

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base `cd2bb9fcf0c53b75489702e917a671d54715bbc2`. The current product passes this fixture. This change adds a desktop regression.

## Verification

- **PASS, actual desktop Studio.** Create a 30 × 20 × 16 mm SubD box centred at XY `[20, 30]` with base Z=10. Delete the top quad centred at `[23.75, 32.5, 26]`. A double-click selects all four open boundary edges. Scale that loop to 0.5× about its centre. World Z then rotates only boundary vertex 93 by +15° around unselected vertex 94 at `[21.875, 33.75, 26]`.
- **PASS, independent coordinates and topology.** The scale uses the point-centre midpoint and the turn uses a planar matrix. Each drag matched the independent positions with 0 mm observed error against a 1e-10 mm limit. The chosen IDs move once. Unselected positions, faces and creases stay exact. Counting face incidence independently yields the same four boundary edges after deletion and both transforms.
- **PASS, history and native files.** During each drag, Done was disabled and the accepted document and cage stayed unchanged. One release added one cage step. Cage Undo/Redo, numeric parity and repeat drag all matched exactly. After Done, document Undo/Redo, Save and fresh Open retained the exact cage. Studio shows one open surface on the accepted and reopened document.
- **PASS, affected checks.** 30 Studio tests, 14 Model tests, browser syntax and diff checks.
- **NOT_RUN.** Other open topologies, exact limit-surface dimensions, alternate renderers, mobile and full local suites. Product types and build were not rerun for this test-only change. #625 remains open for the remaining acceptance cases.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft cage-commit-readiness gizmo gizmo-state-presentation
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-rotation
node --check apps/cad-studio/test/cage-open-transform-browser.mjs
git diff --check
cd apps/cad-studio
CAGE_OPEN_TRANSFORM_FROZEN=1 node test/cage-open-transform-browser.mjs "$EVIDENCE"
```

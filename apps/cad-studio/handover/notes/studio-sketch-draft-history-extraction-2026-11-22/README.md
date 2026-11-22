# D1643 — Extract Studio sketch draft history from App

P4, row 22. Base `bffeaba4e2ffe1df8eea6457c5dbc8d956b5a2a3`.

`useSketchDraftHistory` owns shape settlement, placement transactions, draft feedback and sketch-local Undo and Redo. `App.tsx` retains history routing across editor modes and supplies snap cancellation and camera framing during sketch replay. App goes from 3,706 to 3,556 lines.

- **PASS, focused checks.** 70 Studio tests, scoped ESLint, browser syntax, git diff check and Studio type check and production build. Read-only review confirmed the synchronous shape writes, document and generation guards, and snap cancellation and camera order.
- **PASS, actual Studio WebGPU.** Seven affected flows produced 50 named checkpoints. Circle and Slot placement remain atomic, and history keys respect pending placement. Rectangle width and Circle diameter replay separately from placement. The plane offset replay restores the work plane and gives the expected extruded part. The open Arc flow preserves the preceding placement and validates reopened native geometry. Rejected coordinate feedback and the subsequent accepted coordinate work in the same draft. Each run records equal source capsules and zero source changes, page errors or console errors.
- **PASS, before/after control.** Ran the corrected Rectangle driver against the base App and the extracted App. The complete captured JSON matched exactly at shortcut Undo and Finish, including the document, selection, history and sketch panel.
- **FAIL, corrected checks.** The first lint found an unused type import after the extraction. The original numeric browser test also failed on the base App because it expected an empty Undo history after placement. The corrected test verifies the independent placement and dimension steps. Both current numeric flows pass.
- **NOT_RUN.** Full local suites, WebGL2 and mobile.

Use Node 22.19.0, installed Chrome and Playwright (`CHROME`, `PW_DIR`), the heavy gate and output directories outside Git. Desktop runs use loopback requests and an empty external font stylesheet.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test draft-history placement-history open-arc-radius-history open-polyline-terminal-length sketch-coordinate-feedback
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/sketch/useSketchDraftHistory.ts apps/cad-studio/test/sketch-numeric-draft-history-browser.mjs
pnpm --dir apps/cad-studio build
git diff --check
cd apps/cad-studio
SKETCH_CIRCLE_PLACEMENT_SOURCE_FROZEN=1 node test/sketch-circle-placement-history-browser.mjs "$OUT/circle"
SKETCH_SLOT_PLACEMENT_SOURCE_FROZEN=1 node test/sketch-slot-placement-history-browser.mjs "$OUT/slot"
D1059_SOURCE_FROZEN=1 node test/sketch-numeric-draft-history-browser.mjs "$OUT/rectangle"
D1060_SOURCE_FROZEN=1 node test/sketch-numeric-draft-history-browser.mjs "$OUT/numeric-circle" --circle
D1076_SOURCE_FROZEN=1 node test/sketch-plane-draft-history-browser.mjs "$OUT/plane"
OPEN_ARC_RADIUS_HISTORY_SOURCE_FROZEN=1 node test/open-arc-radius-history-browser.mjs "$OUT/arc"
SKETCH_COORDINATE_FEEDBACK_FROZEN=1 node test/sketch-coordinate-feedback-browser.mjs "$OUT/feedback"
```

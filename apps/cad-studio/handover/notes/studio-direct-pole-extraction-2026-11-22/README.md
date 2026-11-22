# D1648 — Extract Studio Direct control-point editing from App

P4, row 22. Base `4eec77682b8b5388d377f20258d6b1f33109e4a2`.

`useDirectPoleEditor` owns the selected control point, typed edits, drag preview and release. It retains the live document, geometry, point and worker checks. Studio App supplies the current mode restrictions, commit and notice callbacks. App goes from 3,522 to 3,482 lines.

- **PASS, focused checks.** 20 tests, scoped ESLint, browser syntax, Studio type check and production build, and Git diff check. The existing curve and surface weight tests now exercise the current panel and field components.
- **PASS, actual Studio WebGPU.** Four flows recorded 25 checkpoints. Escape cleared the selected point during a real Z drag. A late release left the document and Undo entry unchanged. A second drag moved only surface control point (1,1) from [50, 24, 3] to [50, 24, 6] mm and took one Undo step. The curve flow verified typed coordinates. Curve and surface flows verified weight edits and draft clearing after owner changes. Undo, Redo and native Open preserved the expected geometry. Each final run had equal source capsules and zero file changes, page errors or console errors.
- **PASS, before/after control.** The corrected drag driver passed on the base App and on the extracted App. All four checkpoint JSON files and the moved native surface record were byte-identical. The corrected weight driver also passed in both versions. The 1,024- and 1,440-pixel desktop saves were byte-identical across the two versions.
- **FAIL, corrected checks.** The first drag test assumed Open cleared Undo. It now checks the actual Undo entry before dragging. The weight test harness still loaded private components removed before D1648. All five failures reproduced on the base. The corrected harness retains checks for invalid drafts, edit events, exact owner changes and native validation. The old desktop weight driver also expected Undo to keep a selected pole. That timeout reproduced on the base. The corrected driver verifies owner clearing and selects the point explicitly before reading the saved value.
- **NOT_RUN.** Full local suites, WebGL2, mobile and product tests of other Direct edit tools.

Use Node 22.19.0, installed Chrome and Playwright (`CHROME`, `PW_DIR`), the heavy gate and output directories outside Git. Use the loopback-only preload with an empty external font stylesheet for the retained drivers.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test direct-pole-selection direct-pole-weight gizmo-presentation gizmo-state-presentation curvature-readout
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/useDirectPoleEditor.ts apps/cad-studio/test/{direct-pole-drag-browser.mjs,direct-pole-weight-browser.mjs,direct-pole-weight.test.ts}
node --check apps/cad-studio/test/direct-pole-drag-browser.mjs
node --check apps/cad-studio/test/direct-pole-weight-browser.mjs
pnpm --dir apps/cad-studio build
D1648_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-pole-drag-browser.mjs "$OUT/drag"
DIRECT_POLE_SELECTION_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/direct-pole-selection-browser.mjs "$OUT/curve"
DIRECT_POLE_SELECTION_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/direct-pole-selection-browser.mjs "$OUT/surface" --surface-only
D1386_SOURCE_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/direct-pole-weight-browser.mjs "$OUT/weights"
git diff --check
```

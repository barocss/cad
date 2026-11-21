# D1537 — Verify that saved Turn sections retain their authored width

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `4b0b6fea9346b49bb41c94ad8862cf31d986aa3c`. Both Turn commands copy the resolved sketch coordinates at creation. The source sketch reference and the generated section copies have different roles in the saved Loft.

- **PASS, actual desktop Studio.** Create +360° Ruled and Smooth Turns 40 mm high from two parameter-backed 12 × 8 mm sketches. With AO off, the Ruled result has distinct station edges and the Smooth result has long continuous sides. In Parameters change the source X ends from 13 mm to 15 and 17 mm. The source widths become 14 and 16 mm because their X starts are at 1 mm. Both Turn node sets and their section copies stay exact. Undo, Redo, native Save, and fresh Open preserve the expected values and bodies.
- **PASS, native geometry.** At world heights 3, 23 and 43 mm each solid still has a 12 × 8 mm section. The Ruled section widths come from the native ring vertices. The Smooth widths come from four native corner rails. Strict validity, native digests and volumes remain exact across both edits and reopening. The Ruled solid has 18 faces and 36 edges at 2560 mm³. The Smooth solid has six faces and 12 edges at 3840.49391848882 mm³.
- **PASS, affected checks.** The original desktop +360°, −360°, +450° and Save/Open control passes. Eight Model tests, scoped lint, browser syntax and Git diff pass. Both desktop runs report zero runtime errors, console errors and worktree changes.
- **FAIL, corrected driver path.** The first probe attempted to open a consumed source sketch directly from the History strip and timed out before changing a parameter. The qualifying desktop run uses the existing Parameters panel.
- **NOT_RUN.** Local build and types for this test-only change, mobile, full local suites and other browser backends. #630 stays open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs ruled-turn-command smooth-turn-angle
pnpm exec eslint apps/cad-studio/test/smooth-turn-browser.mjs
node --check apps/cad-studio/test/smooth-turn-browser.mjs
git diff --check
SMOOTH_TURN_SOURCE_FROZEN=1 node apps/cad-studio/test/smooth-turn-browser.mjs "$EVIDENCE/width" --source-width
SMOOTH_TURN_SOURCE_FROZEN=1 node apps/cad-studio/test/smooth-turn-browser.mjs "$EVIDENCE/control"
```

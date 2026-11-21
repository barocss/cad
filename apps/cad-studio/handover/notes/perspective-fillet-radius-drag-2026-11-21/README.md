# D1475 — Drag a new Fillet radius end-on in perspective

P4, row 20, [#214](https://github.com/barocss/cad/issues/214). Base: `c3ba8393ccf5f5cbff7d1e12961cfbf192f4463d`.

Extend the desktop test for the existing single-edge control to a perspective camera. Orbit by real right-button movement. Aim the eye along the outward radius line through the picked edge. Compute screen scale from camera depth, field of view and canvas height at the radius anchor. The test calls no production drag helper.

## Verification

- **PASS, actual desktop Studio, perspective.** Pick the straight top edge of a 40 × 30 × 10 mm stock. The projected 14.14 mm radius-line sample spans 0.0000334 CSS px. Starting at R2, two horizontal moves leave the radius at 2 mm. A 50 px upward move reaches 4.5 mm. Returning the pointer to the starting point and releasing restores R2 and leaves the source recipe unchanged.
- **PASS, zoom and geometry.** A 24 px upward drag sets R3.5 at 18.9542 px/mm. Wheel zoom during that gesture preserves its conversion. At the closer, realigned camera, a new 24 px gesture sets R2.5 at 41.5214 px/mm. Cancel preserves the source. Applying R3.5 gives exactly the typed recipe. Undo, Redo, Save and fresh Open preserve the expected edit. Strict native B-rep, end vertices, section midpoint and Studio Worker volume agree with the independent analytic check. Native volume is 11894.845100064756 mm³.
- **PASS, controls.** The existing actual orthographic run and its 3.8/4.2 px transition run both pass. 37 focused Studio tests, browser driver syntax and diff checks pass. No runtime code changed.
- **NOT_RUN.** Actual History perspective, curved edges, multi-edge dragging, alternate desktop GPU backends, mobile, full local suites and a local production rebuild for this test-only change. #214 stays open.

Use Node 22.19.0 and the existing desktop Chrome and Playwright. Gate one heavy run at a time, freeze worktree writes during each browser run, and keep evidence outside Git.

```sh
node --check apps/cad-studio/test/fillet-end-on-handle-browser.mjs
git diff --check
cd apps/cad-studio
node scripts/test.mjs scalar-handle-drag history-fillet-radius-receipt gizmo
export FILLET_END_ON_SOURCE_FROZEN=1
node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/studio-perspective" --perspective
node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/studio-orthographic"
node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/studio-near-transition" --near-transition
```

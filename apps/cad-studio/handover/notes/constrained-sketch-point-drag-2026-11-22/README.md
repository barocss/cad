# D1698 — Drag a constrained sketch point

P1 advanced sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `d6a9c028e422c0e36267f55e8bbe476fa098820d`.

Select mode can drag a vertex of a supported independent closed polygon. The viewport previews each valid result and emits one sketch edit on release. A click and Shift-click still pick the same points. Escape cancels the gesture. If the pointer would violate the constraints or collapse the outline, the last valid preview stays visible.

The drag uses the existing sketch solver and shape schema. It tries the pointer goal and may project onto a verified one-degree-of-freedom direction. The projected goal must still pass the full finite-motion residual and native loop checks. The original dimensions, relations and side IDs remain in the model. The temporary pointer goal stays in the gesture.

The source is bounded to 3–16 vertices, with straight sides or up to two nonadjacent radius-locked minor arcs with tangent carriers. Linked profiles, holes, splines and ellipses use their existing editing paths. Local tangent projection can still refuse a target on a nonlinear constraint. The model tests cover the refusal of a first-order direction that cannot satisfy a finite move.

## Verification

- **PASS, live desktop Studio WebGPU.** A straight outline with locked width 40 mm projected the pointer at `[46,40]` onto point 3 at `[40,40]`. Dragging the fixed first point kept its coordinates. A target that collapsed the right side kept the last valid preview. Click selection, Shift-click and Escape worked. The draft coordinates changed once on release. One Undo and one Redo restored the exact before and after points.
- **PASS, live R6 Fillet and native Save/Open.** The pointer at `[40,40]` moved point 4 from `[34,30]` to `[34,40]`. Studio retained both tangent relations, the locked R6 and the original face IDs. Finish rebuilt the 10 mm extrusion with the original side IDs and strict closed native geometry. The native cylinder is tangent to both retained planes. Save, fresh Open and Edit sketch reproduce both output hashes and all accepted positions. The input files retain their bytes. Ten checkpoints recorded zero page errors, console errors or worktree changes. The two fixtures intentionally carry a saved Fix at the sketch anchor, so the existing redundant-constraint notice appears before and after the drag.
- **PASS, existing spline drag regression.** The D830 desktop driver verified real Spline handle press, scan retirement, release or cancel, and one-step sketch Undo and Redo.
- **PASS, affected checks.** 13 Model tests, including six new drag tests, and 11 Studio tests. Model and Studio type checks, scoped ESLint, Studio build and diff check passed.
- **FAIL, older D353 driver setup.** Its Space shortcut timed out waiting for `.palette input` before creating a sketch. The current D830 path entered Sketch from the workspace control and exercised the affected Spline gesture.
- **NOT_RUN.** A mixed convex/reflex group after drag, persistent Chamfer setbacks, full local suites, WebGL2, mobile, live AI provider and the held B06 PDF. First mechanical CAD remains 8/10, B06 remains 6/7 and overall completion is unmeasured.

| Saved shape | Volume in mm³ | Native body SHA-256 |
| --- | ---: | --- |
| Straight, 40 × 40 × 10 | 16000 | `3290da2b2252b689797e04163282e63acdf487e26febfc6ae6ddffcc5efe9b72` |
| One R6 Fillet, 40 × 40 × 10 | 15922.743338823082 | `a4b788723fa0002c90ad7d356bb9db9027b02aaa76ba359e0d743b9c4bc61dcd` |

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-point-drag sketch-mobility corner-batch corner-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test draft-history overlaid-trim-readiness analysis-hover-pointer wheel-zoom-preference
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/sketch/pointDrag.ts packages/barocss-cad-model/test/sketch-point-drag.test.ts \
  apps/cad-studio/src/viewport/{Viewport.tsx,SceneViewport.tsx,viewportPointerInput.ts,sketchPointDrag.ts} \
  apps/cad-studio/src/sketch/useOverlaidLines.ts apps/cad-studio/src/App.tsx \
  apps/cad-studio/test/{overlaid-trim-readiness.test.ts,sketch-point-drag-browser.mjs}
node --check apps/cad-studio/test/sketch-point-drag-browser.mjs
D1698_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/point"
D830_SOURCE_FROZEN=1 node apps/cad-studio/test/overlaid-lines-browser.mjs "$OUT/spline-d830" --spline-drag
git diff --check
```

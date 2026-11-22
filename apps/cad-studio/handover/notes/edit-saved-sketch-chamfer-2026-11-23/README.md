# D1700 — Edit the setback of a saved sketch Chamfer

P1 advanced sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Parent `5e4b62b6f6019fb64fc129f22434bdcf5f058bf5`.

Reopen a sketch in Studio, select one recognizable constrained bevel edge, and use **Edit Chamfer**. **Distance** starts at the saved setback in millimeters. The outline previews the change and Apply records one sketch edit. The size is recovered from the saved length and angle constraints and its true orthogonal carriers. The edit uses those same constraints and keeps the support intersection, unchanged points and side IDs. A change that needs to move the implicit sketch anchor or detach an authored binding is refused.

## Verification

- **FAIL, parent capability.** The parent renders corner commands from a selected point or adjacent line pair. Its single-edge selection has a generic edge dimension and provides no saved Chamfer setback editor. This finding is from the parent source.
- **PASS, actual desktop Studio WebGPU.** Save and reopen a notched sketch with two C6 chamfers. Select the original bevel edge, read 6 mm, preview 8 mm, and apply with Enter. The selected convex bevel changes from `[44,40] → [38,34]` to `[46,40] → [38,32]`. The neighboring reflex bevel has the same endpoints and 6 mm setback. Undo and Redo each restore the whole sketch in one step. Finish, Save and fresh Open retain both walls, their carrier relations and the editable 8 mm and 6 mm values. Nine desktop checkpoints recorded zero page errors, console errors or worktree changes.
- **PASS, refused edits.** Empty input, a 24 mm setback that consumes the shared carrier, and an 8 mm edit that would detach the saved `bevelX` parameter were refused in Studio. The live document and input files kept their bytes. Cancel restored the saved 6 mm value on reopening the editor.
- **PASS, exact native geometry.** Both native support intersections and all four seam IDs survive. Wall `n1.side[e9]` changes from 6/6 to 8/8 mm and `n1.side[e10]` stays at 6/6 mm. The strict native body passes the independent area and volume comparison. Volume falls from 20000 to 19860 mm³, equal to `20000 − (8² − 6²) × 10 / 2`. The reopened body reproduces both planes and the exact hash.
- **PASS, affected regressions.** The D1699 point-drag and D1697 pending Agent render and inspection flows passed in desktop Studio. Model tests also edit the reflex member alone and edit a rotated direct-perpendicular profile through reopening. The affected local suites passed 56 Model and 50 Studio tests. Model and Studio type checks, ESLint, production Studio build, driver syntax and diff check passed.
- **NOT_RUN.** Agent discovery and resizing of a saved Chamfer, arbitrary-angle bevel editing, full local suites, WebGL2, mobile, live AI provider and the held B06 PDF. First mechanical CAD remains 8/10 and B06 remains 6/7. Overall completion is unmeasured.

| Native output | Bevel e9 | Bevel e10 | B-rep SHA-256 |
| --- | ---: | ---: | --- |
| Before edit | 6 mm | 6 mm | `a2f99254a4d226221dd11c82054da761b2dd661137aadc48444adef28cd360d5` |
| After edit and fresh Open | 8 mm | 6 mm | `40b2dbef36d61300a322886b40ebb35f2705924408a483ec11c586c862e35c42` |

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-chamfer-edit sketch-chamfer-retention sketch-point-drag revision-pinned-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/sketch/chamferEdit.ts packages/barocss-cad-model/test/sketch-chamfer-edit.test.ts \
  apps/cad-studio/src/sketch/{constraintInspection,cornerDraft}.ts apps/cad-studio/src/ui/{ConstraintTools,SketchCornerTools}.tsx \
  apps/cad-studio/src/viewport/Viewport.tsx apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
node --check apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
D1700_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/resize" --resize
D1699_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/drag"
D1697_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent-review" --review
git diff --check
```

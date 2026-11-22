# D1719 — Drag the setback of one saved sketch Chamfer

P1 advanced sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `60be93a7c988f46a0333c63ddb307e09b21180c2`.

Use one size handle for **Edit Fillet** and **Edit Chamfer**. The saved Chamfer handle follows its bevel midpoint. The two existing straight carriers determine the midpoint travel, so convex and reflex bevels use their own growth directions. Pointer motion stays a preview until Apply. Keep the same numeric edit, constraint checks and history path.

## Verification

- **FAIL, base interaction.** Desktop Studio opens the C6 bevel in **Edit Chamfer**. It offers numeric entry and has no setback handle on the bevel.
- **PASS, desktop Studio WebGPU.** Drag the selected convex bevel midpoint from (41, 37) to (42, 36) mm. The C8 preview matches the numeric preview's projected outline byte for byte. C24 and a change that would detach a coordinate binding are refused. Cancel preserves the accepted document. Apply, Undo, Redo, Finish, Save and fresh Open pass. Twelve checkpoints have zero page errors, console errors or source changes.
- **PASS, opposite growth direction.** After fresh Open, select the retained C6 reflex bevel. Drag from (35, 18) to (34.5, 18.5) mm. Studio previews C7 in the opposite direction and preserves the accepted C8/C6 pair on Cancel.
- **PASS, native geometry.** Wall e9 retains its original carrier faces with seam coordinates (46, 40) and (38, 32) mm after C8. Wall e10 retains both original C6 setbacks and seams (38, 21) and (32, 15) mm. The strict 10 mm Extrude has native volume `19860.000000000007 mm³` from area `60 × 40 − 16 × 25 − (8² − 6²)/2` and body SHA-256 `40b2dbef36d61300a322886b40ebb35f2705924408a483ec11c586c862e35c42`. The fresh Open yields the same native result.
- **PASS, affected checks.** 19 Model tests, 53 Studio tests, scoped ESLint, Studio types and production build, both driver syntax checks and Git diff check. The D1718 Fillet drag passes with the shared handle.
- **NOT_RUN.** Simultaneous setback edits, applying the reflex C7 preview, nonorthogonal Chamfer, other sketch planes, WebGL2, mobile, full local suites and live providers. The first mechanical CAD milestone remains 8/10. Issue #21 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1719_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/base" --resize-drag-base
D1719_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/verified" --resize-drag
D1718_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/fillet-control" --radius-drag
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-chamfer-edit sketch-chamfer-retention sketch-fillet-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history scalar-handle-drag
pnpm exec eslint apps/cad-studio/src/viewport/{SketchCornerSizeHandle.tsx,Viewport.tsx} apps/cad-studio/test/{sketch-point-drag-browser,sketch-chamfer-drag-browser}.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
node --check apps/cad-studio/test/sketch-point-drag-browser.mjs
git diff --check
```

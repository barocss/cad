# D1718 — Drag the radius of one saved sketch Fillet

P1 advanced sketch, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `7b7fc79e53fc277b616c33ea1770bb2175f45860`.

Select one saved orthogonal sketch Fillet and open **Edit Fillet**. Drag its arc midpoint. The handle measures motion on the sketch plane and changes the shared preview field in 0.1 mm increments from its starting value. Use the same geometric edit and refusal checks as numeric entry. The draft survives pointer release for explicit Apply or Cancel. A cancelled pointer restores the preview that preceded the press.

## Verification

- **FAIL, base interaction.** The desktop saved R6 Fillet offers numeric **Edit Fillet** and has no on-arc radius handle.
- **FAIL, intermediate verification.** Two gating attempts hid the handle in the default Perspective sketch view. Its Top camera is slightly off the pole. The final handle intersects the pointer ray with the sketch plane and uses the existing sketch hit mapping. The first type check required the camera projection to supply only its two screen coordinates.
- **PASS, desktop Studio WebGPU.** A click without movement retains R6. Dragging to R30 refuses the preview and preserves the accepted sketch. A real pointer drag previews R8 at the arc midpoint while the accepted sketch and file remain intact. The typed R8 preview has identical projected points. Cancel, explicit Apply, Undo, Redo, Finish, Save, fresh Open and reopening the sketch pass. The bound tangent change is refused. A separate ordinary sketch point-drag control passes on the same source.
- **PASS, native geometry.** The tangent ends are (40, 22) and (32, 30) mm at R8. The four straight carrier planes and all five original side IDs are retained. The strict 10 mm Extrude has native volume `11862.654824574367 mm³` and body SHA-256 `7681b66cb929f4b39a58e3018636f1da717bd5619ad21ec2b7be31c943a435bd`. The fresh Open yields the same native body.
- **PASS, affected checks.** 12 Model tests, 53 Studio tests, scoped ESLint, Studio types and production build, browser driver syntax and Git diff check.
- **NOT_RUN.** Nonorthogonal or simultaneous radius edits, direct Chamfer drag, active pointer cancellation and keyboard handle shortcuts, other planes, WebGL2, mobile, full local suites and live providers. The first mechanical CAD milestone remains 8/10. Issue #21 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1718_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/base" --radius-drag-base
D1718_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/verified" --radius-drag
D1698_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/point-control"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-fillet-edit sketch-point-drag
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history scalar-handle-drag
pnpm exec eslint apps/cad-studio/src/viewport/{SketchFilletRadiusHandle.tsx,Viewport.tsx,viewportPointerInput.ts} apps/cad-studio/test/sketch-point-drag-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-point-drag-browser.mjs
git diff --check
```

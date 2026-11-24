# D1895 — Verify the native Crossing snap lifecycle

P1 [row 09](../../roadmap-rows/09.md) and [row 15](../../roadmap-rows/15.md), [#228](https://github.com/barocss/cad/issues/228). Base `155007c7410ecc0c86f085f97f915a54020fe806`. Evidence-only change. Reuse the native edge–plane Crossing browser driver without changing the snap implementation. [D864](../native-edge-plane-crossing-snap-2026-11-13/README.md) covers the native straight-edge geometry, tilted and axial workplanes, visibility, tool changes, Cancel, File Open, and downstream Extrude.

- **PASS, New part.** The same workspace first shows Crossing for the old body at Z3. New part clears the cue. The same location writes grid corner `(4,6)`. One Undo restores the empty document.
- **PASS, same-document source edit and rebuild.** Apply changes the original Extrude height from 10 to 2 mm. Undo restores the 10 mm source and Crossing. Redo sends the 2 mm source to the real Worker. The test holds delivery of that original result. The old 2800 mm³ display remains stale, and Studio refuses entry to Sketch. After delivery, the prior crossing location writes grid corner `(4,6)`. The strict native source ends at Z2 and has a volume of 560 mm³.
- **PASS, rapid input.** Four consecutive Chrome clicks place independent rectangles from the current crossing points `(4.2346,6.3457)` and `(24.2346,20.3457)`. One Finish adds one sketch with two separate material regions and the source features intact. One Undo, one Redo, native project Save and fresh Open match the expected document.
- **PASS, affected checks.** Seven actual desktop scenes. Thirteen Model tests, seventeen Studio tests, browser syntax, focused lint and Git diff check pass.
- **FAIL, intermediate harness attempts.** The first second corner in the empty sketch lay under the editing overlay. The initial Worker hold delayed History Apply's precommit result. The next run exposed Sketch's existing entry guard during a pending Redo. The file Save helper then attempted a browser download in a download-disabled context. The final run uses a clear canvas position, holds Redo's rebuild, checks the actual guard, and uses native project Save. No product failure remained in the original scope.
- **NOT_RUN.** Full local suites, local production build for this test-only change, curved/placed/section crossings and mobile. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
node --check apps/cad-studio/test/native-edge-plane-snap-browser.mjs
node --check apps/cad-studio/test/native-edge-plane-snap-lifetime.mjs
D1895_SOURCE_FROZEN=1 node apps/cad-studio/test/native-edge-plane-snap-browser.mjs "$OUT/final" --lifetime
pnpm --dir packages/barocss-cad-model test osnap edge-plane-crossing
pnpm --dir apps/cad-studio test sketch-snap-visibility object-snap-kinds stop-work-ownership
git diff --check
```

# D1745 — Extract Sketch camera framing from Studio Viewport

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `e2ca19e1e5b2870d210b109badeb4cdcca374c1a`.

Move Sketch toolbar bounds, the plane-owned pending frame, and the three Sketch camera actions into `useViewportSketchFraming`. The hook measures the rail in canvas coordinates. The frame uses the current canvas size and work area after the Sketch rail mounts. Immediate commands read the current active plane. Viewport.tsx decreases from 1,240 to 1,204 lines.

- **PASS, desktop Studio before and after.** The four Chrome WebGPU runs match all 23 recorded states and 24 camera or Fit observations exactly. Reopen in XY, vertical and tilted planes, in perspective and orthographic views. Preserve the camera with auto-frame off, then use Normal and fit Sketch to recover the active plane, including from edge-on or far-panned views. Edit the sketch to 1,875 mm³, Undo, Redo, Save, Close and reopen the native project. Studio asserts the saved document and the reopened document equal the accepted edit.
- **PASS, Model work-area Fit.** A 100 × 45 × 28 mm box yields 98 projected surface samples in each of 16 observations. All samples avoid the open or closed docks. The smallest measured frame clearance is 11.999992479999605 CSS px. Toolbar Fit, keyboard Fit with existing selection, and automatic Fit on fresh native Open match.
- **PASS, affected checks.** 23 Studio tests, scoped ESLint, Studio TypeScript and production build, and Git diff check. All four browser runs have zero page errors, console errors, source changes or downloads.
- **FAIL.** None.
- **NOT_RUN.** Full local suites, WebGL2 and mobile. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Run both desktop commands on the base and candidate. Use the heavy gate, Node 22.19.0, installed desktop Chrome and Playwright, and separate external output directories. Compare the receipts' states and observations.

```sh
SKETCH_REOPEN_CAMERA_FROZEN=1 node apps/cad-studio/test/sketch-reopen-camera-browser.mjs "$OUT/camera"
D668_SOURCE_FROZEN=1 node apps/cad-studio/test/model-work-area-fit-browser.mjs "$OUT/fit" --fixed
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-reopen-camera project-open-fit sketch-length-label sketch-constraint-mark
pnpm exec eslint apps/cad-studio/src/viewport/{Viewport.tsx,useViewportSketchFraming.ts}
pnpm --dir apps/cad-studio build
git diff --check
```

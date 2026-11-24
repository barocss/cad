# D1978 — Extract Studio Section viewport ownership

P4 [row 5](../../roadmap-rows/05.md) and [row 22](../../roadmap-rows/22.md). [#44](https://github.com/barocss/cad/issues/44). Base `3c39ce9bc1bb655ad604c31be4be509da7fcf163`.

Move placed-only Section handle bounds and original-vertex source admission into `useStudioSectionViewport.ts`. App retains the current model, view and project owners and provides their checks at the existing hook positions. The callbacks still check the captured Open owner when the drag or Worker result arrives. App decreases from 2,446 to 2,438 lines.

- **PASS, actual desktop Studio before and after.** The nine oblique-vertex states match exactly, including the reframed source corner, reordered rows, cap, and delayed replies after Hide, New and replacement Open. Project Save, Close and fresh Open restore the original 10,460 mm³ part.
- **PASS, actual desktop Studio before and after.** The 18 placed-only states and four observations match exactly, including occurrence ownership, Exclude and Restore, live clipping, Frame and fresh Open. Native project download matches SHA-256 `f1b0d58a1f15fc57033bc2609a1002f4f124c94fd17590e6f7e185e67b35755d`. The JPEG previews and original screenshots show the cap, the excluded occurrence and the two restored solids. Both runs keep the captured source files frozen, with no console errors.
- **PASS, affected checks.** 22 Studio focused tests, Studio types and production build, scoped ESLint and diff check.
- **NOT_RUN.** Placed-only pointer drag and native WebGL2 for the placed fixture. Plane setup and live offset use the existing test hooks, including the forced CPU Section path in a WebGPU viewport. D1970's separate scripted Chat delivery failure was not retested. #44 remains open. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
D1975_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/vertex" --oblique --ownership
SECTION_SELECTIVE_FROZEN=1 node apps/cad-studio/test/section-selective-instance-browser.mjs "$OUT/placed"
pnpm --dir apps/cad-studio build
git diff --check
```

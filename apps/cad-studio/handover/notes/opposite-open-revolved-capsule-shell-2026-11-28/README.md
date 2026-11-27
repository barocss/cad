# D2124 — Shell an original revolved capsule through both ends

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `f1ee05520f62c9d15ca9563f6b7d7d745effee55`.

Uniform Shell accepts the two distinct complete original hemispheres of the canonical capsule Revolve. The exact rectangular meridian of the wall turns about the original Y axis. The two resulting annular faces own the lower and upper rims and the original barrel owns the outer face. The existing Shell document records the original named pair in the authored selection order.

- **FAIL, reproduced base behavior.** Actual desktop Studio selects the two original hemispheres. The previous Shell offers the Wall field and refuses the curved pair. Cancel preserves the original capsule.
- **PASS, actual desktop.** Either pick order previews, cancels, applies and opens the same through cavity. History refuses a 10 mm wall without changing the accepted part. The 2 mm edit, Undo, Redo and Save followed by fresh Open reproduce the same result. The saved native boundary digest is `462e66fc687aee99eb3d9d2befd45b4ef7affda9c78dbc0ac5c1eec1991ff493` in both pick orders. The candidate flow freezes 1,272 source files with zero source changes, runtime errors or console errors.
- **PASS, independent native geometry.** At barrel length 40 mm, outer radius 10 mm and inner radius `r`, the material volume is `40π(100 − r²)` mm³. The centroid is (0,20,0) mm. Expected volumes for 1 and 2 mm walls are 2,387.6104167282426 and 4,523.893421169302 mm³. Native and Worker mass agree. The strict solid has one shell, genus one, eight faces, eight loops, 32 coedges, 16 edges and eight vertices. The original barrel support and all its boundary curve records match. The inner barrel has the prescribed radius and inward normals. The trimmed rims have two arcs and two radial edges per chart, at Y = 0 and 40, and outward normals along negative and positive Y. Native tests include a fractional wall, partial chart and mismatched opening refusals, and six single-opening digests equal to the baseline.
- **PASS, affected checks.** 61 Kernel, 9 Model and 31 Studio tests, prior producer mutation, Kernel/Model/Studio types, scoped ESLint, production build, driver syntax and diff check on Node 22.19.0. Restoring the prior producer fails the new through-Shell regression.
- **FAIL, corrected inspection.** The first baseline inspector asked for a derivative at an exact C0 knot. It now samples away from the knot. The first candidate assertion treated the untrimmed plane as the rim boundary. The final inspector measures the native coedge curves of the actual rim.
- **NOT_RUN.** Local Agent approval, broad freeform Shells, STEP, full local suites, mobile and live providers. [#13](https://github.com/barocss/cad/issues/13) remains open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
OPPOSITE_OPEN_CAPSULE_FROZEN=1 node apps/cad-studio/test/opposite-open-capsule-shell-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
OPPOSITE_OPEN_CAPSULE_FROZEN=1 node apps/cad-studio/test/opposite-open-capsule-shell-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{capsule-shell,part-model,r11-s0,part-tube-shell-walls}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-opening-history shell-walls
pnpm --dir apps/cad-studio test shell-opening-history
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

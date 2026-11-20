# Axis-aligned wall Offset face on a straight hexagonal prism

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Starting main `198be935c7c1c2dfe7af8a58464ff0ab4244b875`. The earlier [scope recovery](../hex-wall-scope-recovery-mac-2026-11-15/README.md) used the cardinal wall of this same fixture as a refusal. This decision admits that wall when the six-sided convex prism passes the existing strict checks.

The wall solver now accepts an exactly zero minor XY normal component. The prior cutoff still applies to near-axis walls with a tiny nonzero component. It intersects the moved support with its two fixed planar neighbors and rebuilds the affected trims using the established prism route. It retains the existing Z end-cap recipe. The feature stays a signed-distance `offset-face` on the originally named wall.

## Verification

- Kernel 24 tests passed, covering both drafted caps and upright hexagonal walls. Exact X and Y normals, strict topology, names and pcurve identity, near-collapse cases and the independent signed-volume oracle passed. The guard still refuses non-hexagonal, concave, tilted, drafted and mismatched inputs in the prism route. Model native Offset tests passed (45). Studio focused tests passed (7). Scoped lint, Kernel build, Model and Studio types, and Studio production build passed.
- Desktop Chrome/WebGPU exercised both 1024 and 1440 px desktop widths. A 10 mm tall convex hexagonal extrusion has a selected wall at y = 0. After signed displacement d, its new plane is y = −d and its endpoints are (3d/4, −d) and (18 − 3d/4, −d). The independent volume is 3840 + 180d − 7.5d² mm³. At +1 mm the measured volume was 4012.5 mm³. At −1 mm it was 3652.5 mm³. All seven fixed supports, all native incidence IDs, and all 36 pcurve IDs matched the source.
- +12 mm and −8 mm collapse a wall and are refused before Apply. History edit, Undo, Redo, native Save and fresh Open reproduce the signed wall and its native geometry. The prior oblique wall offsets and the drafted cap browser flow passed. The browser receipts recorded zero page errors, console errors or watched file changes.
- The desktop proof covers one axis-aligned wall and one oblique wall on the authored prism. The rotated axis fixture is a kernel test. STEP export and mobile were not run.

Run with Node 22.19.0. Use the heavy gate for one task at a time and external output directories.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/prism-wall-offset.test.mjs packages/barocss-cad/test/drafted-cap-offset.test.mjs
node packages/barocss-cad-model/scripts/test.mjs native-offset-face offset-face
node apps/cad-studio/scripts/test.mjs offset-hex-side-feedback offset-face-launch-view
pnpm --filter @barocss/cad-model type-check
pnpm build
cd apps/cad-studio
D1369_SOURCE_FROZEN=1 node test/hex-wall-scope-recovery-browser.mjs "$OUTPUT/wall"
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$OUTPUT/cap"
```

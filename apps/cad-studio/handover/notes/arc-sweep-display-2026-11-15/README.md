# D1296 — Refine Studio's native circular Sweep silhouette

2026-11-15 · FEATURE · P4, rows 05 and 06

A native circular Sweep looked faceted before the GPU drew it. In the original mesh, changing the zoom scaled the same 0.094 mm outer-contour error. Increasing the density of the general tessellator exceeded the display budget in the recorded tilted Sweep probe (293,856 bytes at 16 subdivisions per quarter).

The Model Worker now prepares a display mesh for one uncut exact circular Sweep in the ordinary Studio Model view. It uses 56 steps along the path and 23 steps per half of the circular profile, with extra samples for the inner and outer meridians when needed. Both caps, both walls, and the four displayed rim half-edges use shared boundary points. The two tangent seams remain hidden. Studio draws and picks from this packet with canonical geometry owner IDs. The same packet is used at fit and zoom, with a 192 KiB transfer limit. The accepted B-rep, canonical mesh, and saved document recipe continue to provide modeling and query data.

The interpolation bound for the toroidal wall is `((R+r) dθ² + 2r dθ dφ + r dφ²) / 8`, plus the corner reconstruction allowance. The three terms bound the surface's angular second derivatives. The triangle's barycentric weights cancel the linear terms and bound the centered angle variances by one quarter of each squared step. The planar cap boundary uses the same circular chords as the wall. The screen measurements below apply to the specific tested views and scales.

- **PASS — desktop Studio WebGPU.** A 5 mm radius disk along a 30 mm radius quarter arc now has 2,830 display vertices and 5,244 triangles. Top Ortho ray probes at 41 angles measured 1.556 → 0.061 CSS px at fit and 4.865 → 0.190 CSS px at about 51.76 CSS px/mm. Actual screenshot probes distinguish fill from background, and the zoomed outline was reviewed visually. Front Ortho pointer clicks select body 0, edge 1 at fit, after zoom and after native Save/Open. Its 23 segments measured 0.011656 mm maximum deviation from the analytic half-circle at chord midpoints.
- **PASS — Model and build.** Seven focused tests cover analytic normals, triangle winding, independently sampled surface residual, exact rim sharing, native volume, tilted and reversed paths, straight-cylinder regressions and Worker buffer transfer. The desktop fixture packet uses 181,280 bytes, within 192 KiB. Model type check, Studio production build and scoped lint passed.
- **FAIL, corrected.** The first candidate exceeded the 192 KiB packet budget and fell back to the canonical mesh. Reducing the number of samples across the section and inserting the two silhouette meridians retained the measured target.
- **NOT_RUN.** WebGL2, perspective contour accuracy, arbitrary zoom, sections, downstream operations, multiple bodies, full local suites and mobile.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the runs. The diagnostic arm bypasses just the refined packet call in the served Worker module. It confirms that the original mesh reproduces the faceting. Both final Studio runs matched 407 source files, with zero page errors, console errors and worktree changes.

| Desktop run | Receipt SHA-256 |
| --- | --- |
| Original mesh | `6b4779c9b53f73615a1445c7b960e0c22578b0c70d64d7812dd2cc3b98f44795` |
| Refined mesh | `49dd1ee0f0bd28eb1017f6c37a5a1205453317344d5ca1d1b9986135a2b508c9` |

Native Save SHA-256 was `00511ab88937cfbf254db6f85b5926db2de8ede31c28993df0d019782ae0e9db`.

```sh
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test arc-sweep-display cylinder-display meshWire
D1296_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-sweep-zoom-browser.mjs <external-baseline> --baseline
D1296_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-sweep-zoom-browser.mjs <external-product>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```

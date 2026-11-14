# D1303 — Refine the displayed contours of a circular Sweep with a bore

2026-11-15 · FEATURE · P4, rows 05, 06 and 20

The ordinary Studio Model view can now use a refined display packet for a single uncut exact circular Sweep with a D-shaped exterior and one offset circular bore. The outer grid uses 52 bend steps and 24 profile steps. Each half of the bore uses 20 bend steps and 24 profile steps. Its inward normals follow the torus. Each cap triangulates the same outer and inner boundary samples used by the walls and visible edges. Each bore mouth retains its existing display owner and both native edge names. The two longitudinal bore seams remain hidden.

The tested packet is 186,480 bytes, 2,843 vertices and 4,878 triangles. It fits the existing 192 KiB limit. The packet's 0.02287 mm upper interpolation bound over the tested surfaces differs from the measured screen errors in the table. The Model Worker retains the native B-rep, canonical mesh and volume for modeling and queries. The existing six-face Sweep uses its original grid and cap fan.

| Contour | Original, fit → zoom (CSS px) | Refined, fit → zoom (CSS px) |
| --- | ---: | ---: |
| Top Ortho, inside of bend | 1.305 → 4.080 | 0.055 → 0.173 |
| Top Ortho, outside of bend | 0.766 → 2.396 | 0.065 → 0.204 |
| Front Ortho, start mouth | 0.098 → 0.308 | 0.045 → 0.140 |

- **PASS — desktop Studio WebGPU.** The paired comparison used 64.012 CSS px/mm at zoom. Ray probes measured the filled boundaries. Screenshot probes located fill and background around both bend contours. Real pointer clicks selected edge 10 on the start side at fit and zoom and edge 11 on the end side in Left Ortho. The start rim's selection chords improved from 0.308 to 0.137 CSS px at zoom. After editing the bore diameter from 2 to 3 mm, native Save and fresh Open retained the correct edge indices and mass. Reopened filled mouth errors at zoom were 0.208 CSS px at the start and 0.214 CSS px at the end. The corresponding highlighted edge errors were 0.206 and 0.204 CSS px.
- **PASS — Model checks and build.** 10 focused tests passed. The bore regression verifies both cap areas against the polygon formula, independent inward torus normals, triangle winding, preservation of all 12 display edge owners, and exact shared segments across each edge's two incident face meshes. It tests both radii and the reversed bend. The existing focused tests cover the six-face path, straight cylinder and buffer delivery. Model type check, focused lint and Studio production build passed.
- **NOT_RUN.** Display refinement on the fitted fillet or radial cut, bore-interior shading diagnosis, perspective contour measurements, WebGL2, arbitrary zoom, multiple-body displays, mobile and full local suites. Faint bands inside the bore were visible in the inspected zoom screenshot. This decision measures contours and selection chords.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. The baseline bypassed only the mixed display packet in the served development module. Both desktop runs matched 406 frozen source files and recorded zero page errors, console errors or worktree changes.

| Desktop run | Receipt SHA-256 |
| --- | --- |
| Canonical mesh | `8cee282246b99b16a34aa1754a584a286a99459e294afab2af104b6b1f1a90c3` |
| Refined mesh | `5222f711d5985c7a41e6792e47fca25367cad4b7a06ce998e5e1b0c407efdfc1` |

Native Save SHA-256 is `cbd0e77aea7a869a1fbac1c03fc3f8d6b9a18aa7df3e604612da4facf79851e2`.

```sh
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test arc-sweep cylinder-display meshWire
D1303_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-display-browser.mjs <external-baseline> --baseline
D1303_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-display-browser.mjs <external-product>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```

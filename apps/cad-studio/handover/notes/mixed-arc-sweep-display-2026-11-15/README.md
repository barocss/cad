# D1299 — Refine the inner and outer contours of a mixed circular Sweep

2026-11-15 · FEATURE · P4, rows 05 and 06

One native D-shaped circular Sweep now uses a display mesh with 56 divisions along the bend and 42 divisions around its outer semicircle. Eligibility follows the native surfaces, endpoint planes, and edge uses. The two end caps, inner cylinder, annular faces, and outer toroidal wall use common XYZ samples at their boundaries. Visible edge lines and picks use the same samples and canonical owners. The two tangent longitudinal seams remain hidden. The Model Worker retains the canonical B-rep, mesh, volume, and document recipe. The viewport continues to use the D1296 packet on disk sweeps. Other mixed sections keep their canonical display mesh.

The 2,883 vertices, 5,126 triangles and 202 visible edge segments use 188,144 bytes of Worker buffers, within the 192 KiB limit. The matched angular grid has a conservative toroidal interpolation bound of 0.008824 mm on the desktop fixture. The screen results below measure the projected contour of one specific part.

- **PASS — desktop Studio WebGPU.** The baseline bypassed only the new packet. At the same zoom of 65.112 CSS px/mm, the measured inner contour error went from 4.300 to 0.167 CSS px. The outside went from 2.392 to 0.183 CSS px. At fit the errors went from 1.375 to 0.053 CSS px inside and 0.765 to 0.058 CSS px outside. Screenshot probes confirmed fill and background on both sides, and visual review checked the selected curve. Pointer clicks selected body 0, edge 8 at fit, after zoom and after native Save/Open. Its 56 segments deviated up to 0.001327 mm from the analytic circle at their chord midpoints. The native volume after fresh Open stayed 4061.133938367 mm³.
- **PASS — Model and build.** Nine focused tests passed, covering the original and edited D-section, alternate names, path reversal, signed normals, triangle winding, native boundary ownership and rectangle fallback. The test checks each visible segment against the triangle boundaries of both incident faces and checks the two hidden seams. The retained tests cover disk and straight Sweep packets and the Worker mesh protocol. Model type check, focused lint and the Studio production build passed.
- **FAIL, corrected.** The first cap triangulation rejected one cap's local orientation. The final cap fan starts at the verified inner corner of the convex outline and takes winding from the canonical face normal. It preserves all four cap boundary owners.
- **NOT_RUN.** WebGL2, perspective pixel error, arbitrary zoom, other profile contours, full local suites, and mobile.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. Both Studio runs matched 405 frozen source files and had zero page errors, console errors or source changes.

| Desktop run | Receipt SHA-256 |
| --- | --- |
| Original mesh | `8ab0974f28d44843ffead4ef363deeec581b810c39c6e6d0e6325a564b3bc46e` |
| Refined mesh | `3077f998bcef833c8a8bf70a75098ba55c77604f11f495a88a7fe0e58403ce8d` |

Native Save SHA-256 is `6e0eecb06a092fe5d5903c79d3edb4c070a56ac546b48fd2ab8ffdf0ca031386`.

```sh
pnpm --filter @barocss/cad-model type-check
D1299_SOURCE_FROZEN=1 node apps/cad-studio/test/mixed-arc-sweep-display-browser.mjs <external-baseline> --baseline
D1299_SOURCE_FROZEN=1 node apps/cad-studio/test/mixed-arc-sweep-display-browser.mjs <external-product>
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test arc-sweep-mixed-display arc-sweep-display cylinder-display meshWire
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```

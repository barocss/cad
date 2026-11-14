# D1282 — Refine the displayed faces and edges of a two-guide Loft

2026-11-15 · FEATURE with independent geometry audit · P4, rows 05 and 06

The ordinary Studio Model view uses one refined mesh for an eligible, single rectangular two-guide Loft. The CAD Worker samples the exact native walls on a common grid. Both incident faces and the displayed edge use the same boundary points. Wall shading uses the native derivatives, and the packet maps its geometry onto the existing face and edge IDs. The accepted document, B-rep, properties, and canonical mesh for queries and exports stay unchanged.

The Float64 mesh bound is the sum of the vertical interpolation term, the mixed derivative term for the cell diagonal, and the boundary and arithmetic allowance. The target is the smaller of 0.01 mm and the longest local control hull extent divided by 1,500. The packet uses at least 32 longitudinal segments and must fit 192 KiB of Worker mesh buffers. Studio retains the canonical mesh when the packet cannot meet its target and budget. This is a fixed per-body packet. Perspective and orthographic views share it.

- **PASS — desktop Studio.** Chrome WebGPU and WebGL2 displayed the refined twisted 10 × 6 to 14 × 4 mm Loft with its source Direct curves present. Right Ortho picked the same named rear-right edge before and after zoom and after History edit, Undo, Redo, native Save and fresh Open. An independent interior point picked the correct face. A second WebGPU run created and applied the untwisted tapered Loft and confirmed the refined mesh after creation.
- **PASS — display measurements.** The twisted example used 4,160 triangles instead of 144 and had a computed mesh bound of 0.007977 mm. The sampled rear-right selection polyline differed from the projected curve by at most 0.030 CSS px at fit and 0.050 CSS px at 787 px model height on either backend. After the edit and reopen the maximum at fit was 0.095 CSS px. WebGPU interior ray hits differed from the modeled wall by at most 0.001454 mm across 24 independent samples. Screenshot probes on both sides of the rear-right rail resolved filled solid and background in both backends. A visual review also checked perspective, zoom and reopen.
- **PASS — native and controlled checks.** Nine Kernel tests and 14 Model tests passed, along with Kernel and Model type checks, Studio production build, focused lint and code shape. Native oracles verified quadratic and cubic walls, shared boundary segments, winding, normals, world translation and the same strict six-face solid and mass after file reopen. The 1:100 fixture retained below 0.00004 mm at every rail chord midpoint. The Worker sends a cached packet by reference on repeated evaluation. Preview and ordinary evaluation use the refined packet. Section evaluation and unsupported placements stay on the canonical path.
- **FAIL, corrected.** The first browser run retained the selection-filter locator from the closed tab during reopen. The final run resolved it in the fresh tab. The independent audit also reproduced a small-part coarsening with the first absolute-only target. The final relative target and sample floor passed the 1:100 test.
- **FAIL — WebGL2 shading at a grazing angle.** Right Ortho screenshots still show faint bands on the left wall, distinct from the measured outline. The first failing pipeline stage has not been isolated. D1283 will compare canonical/refined packets and AO states on the same model and camera.
- **NOT_RUN.** Full local suites, mobile, paid inference, quality after downstream cuts or assembly transforms, and a general screen-pixel guarantee across all zoom levels. Studio uses the regular path for Render, sections, and analysis.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. All three final Studio runs had zero page errors and console errors, and matched their source snapshots after cleanup.

| Desktop flow | Frozen source files | Receipt SHA-256 |
| --- | ---: | --- |
| WebGPU | 903 | `64ed2a3582626f77e6948b2606cf94aa3f17f077b19569866b09eb3abd5af1b6` |
| WebGL2 | 903 | `63b0d0e6b54500ca10d35aec95621ec1b39a0e8b45f9a5669d284bb05f19267a` |
| WebGPU creation | 905 | `ff4f32871fa2626f59229f8148a1c4cfa29d91e77ddf7f38e48c8a8c87bf1a88` |

Both twisted runs saved the same native file with SHA-256 `e16f78abd96cb0bda94c89326646696436c220322da10708c926711a08d5b297`.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/two-guide-loft-display.test.mjs packages/barocss-cad/test/loft-two-guides.test.mjs
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test api-loft-guide meshWire wire-doc
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
D1282_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-display-browser.mjs <external-webgpu-evidence>
D1282_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-display-browser.mjs <external-webgl2-evidence> --webgl2
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs <external-creation-evidence> --check-display
git diff --check
```

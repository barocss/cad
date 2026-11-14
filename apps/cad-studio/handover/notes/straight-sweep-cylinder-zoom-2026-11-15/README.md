# D1291 — Refine straight Sweep cylinders as Studio zooms

2026-11-15 · FEATURE · P4, rows 05 and 06

The normal correction in D1290 leaves the cylinder mesh density unchanged. Studio now keeps the existing two cylinder display tiers for a single committed exact straight Sweep with two coaxial circular rims. The chosen tier supplies the surface, rim lines and edge picking together. The Worker keeps the canonical mesh, owner IDs, native solid and document recipe. The same 192 KiB budget applies to both tiers. The upright Extrude and Band keep their existing view rules.

In perspective, the tier selection bounds the projection scale over the whole cylinder using its nearest depth and transverse extent in camera coordinates. In orthographic views the scale is uniform. Studio targets a 0.25 CSS pixel chord error and uses the finest available tier when the bound exceeds that tier or approaches the near plane.

- **PASS — desktop Studio WebGPU.** The fixed-mesh diagnostic used 32 rim segments at both scales. At 295 CSS pixels rim height, its exposed rim and projected convex silhouette differed from the analytic cylinder by 0.714 CSS px. With refinement, the rim used 64 segments and measured 0.179 CSS px. The filled-mesh silhouette measured 0.177 CSS px. Actual pixel probes detected the fill on the inside and background on the outside. At low zoom both arms used 32 segments. The same public pointer pick selected body 0, edge 1 at both scales and after native Save and fresh Open. The reopened Right orthographic view measured 0.083 CSS px.
- **PASS — regression and build.** Five Model checks cover the original Extrude, tilted Sweep owners, shared cap and wall samples, physical chord error and Worker transfer. The two Sweep tier buffers total 61,664 bytes. The existing Top orthographic Extrude browser flow, Studio production build and focused lint pass.
- **NOT_RUN.** Full local suites, WebGL2 and mobile, cosmetic contour interpolation, multiple bodies, clipped and transformed displays, and extreme zoom beyond the bounded tiers.

## Commands and evidence

Node 22.19.0. Browser runs had zero page errors, console errors or observed source changes.

| Desktop run | Frozen files | Receipt SHA-256 |
| --- | ---: | --- |
| Fixed-mesh diagnostic | 406 | `aff4a37371d4aff3fc41fee281acf890832ea42cf02ee9bcbb33ae25b030101c` |
| Refined Sweep | 406 | `5cddd39693dbf964509e924bf578f72f15cb2ce0aea5cbf9c697e6b00730dc44` |
| Upright Extrude | 407 | `e5cd980961d8e99d2159c5d12a8f1b883d6303f91514f32307c73a1dfd228e18` |

The native Save SHA-256 was `1834b2ac1a0143f0f11d04d9e2b6f00af6d874fa669063b8c32dcf90c674ea2e`.

```sh
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test cylinder-display meshWire
D1291_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-cylinder-zoom-browser.mjs <external-baseline> --baseline
D1291_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-cylinder-zoom-browser.mjs <external-product>
D1145_SOURCE_FROZEN=1 node apps/cad-studio/test/native-cylinder-zoom-browser.mjs <external-extrude>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```

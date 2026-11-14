# D1290 — Match display normals across ruled cylinder seams

2026-11-15 · FEATURE · P4, rows 05 and 06

The native straight Sweep cylinder in D1289 showed a lengthwise shading step. Both cylinder halves had identical seam positions, but the tessellator averaged each half's triangle normals separately. The last chord of one half and the first chord of the other produced normals 11.25° apart at eight samples per quarter turn.

The ruled cylindrical faces now use the signed radial normal. The tessellator checks the circular base span coefficients and applies the face sense, including inward bore and reflected faces. The existing triangulation, vertex positions, edge samples, face IDs and cap normals are retained. Noncircular ruled faces retain triangle normals.

- **PASS — fixed-camera desktop Studio WebGPU.** Seventeen 13-pixel cross-seam samples produced a median maximum adjacent red-channel change of 16 before and 3 after the correction. The corresponding median maximum second difference in the center five samples went from 15 to 1. AO off, on, and off again gave the same values within each arm. The diagnostic arm replaced only the two ruled normal arguments in the served module. The product arm opened and saved the exact cylinder, then opened it from the actual file chooser in a fresh context and read the Sweep History.
- **PASS — mesh comparison.** The D1289 emitted baseline and corrected tessellator gave bit-identical positions, triangle indices, edge samples and face records on the same strict native solid. The maximum difference between coincident seam normals was 0.19603428065912928 before and 1.7405300928389358e-15 after, measured as a difference between unit vectors. The 3 mm cylinder retains 0.01444581998 mm chord sagitta at the default display density.
- **PASS — affected checks.** Twenty-six Kernel tests and 13 Model tests pass. Kernel type check, code shape, focused lint and Studio production build pass.
- **FAIL, corrected.** The first product driver limited the adjacent pixel change to two levels and refused a smooth three-level gradient. The final driver measures the second difference to distinguish a discontinuity from a steady gradient. Both arms were rerun with the same metric and camera.
- **NOT_RUN.** Full local suites, WebGL2, mobile and zoom-dependent silhouette refinement.

## Commands and evidence

Node 22.19.0. Both final Studio runs had zero page errors, console errors or source changes and verified 402 frozen files after cleanup.

| Desktop flow | Receipt SHA-256 |
| --- | --- |
| Diagnostic triangle normals | `5d6cb19d2e54c4171972da3fae17644479dd1f4d266179c3012c4b6897983fd7` |
| Product radial normals | `8e2aed13d565094190484eed01f427e172be9f66376235b377c5cdae2ec4d73d` |

The native Save SHA-256 was `0a043304c2d055a6e612d14d3e1eceb3071b0d2c9f2819b5828dd444f6871594`.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{ruled-cylinder-display-normals,tessellation,tessellate-cylinder-ears,tessellate-flips,exact-straight-sweep,exact-arc-sweep,two-guide-loft-display}.test.mjs
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test cylinder-display meshWire api-loft-guide
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
D1290_SOURCE_FROZEN=1 node apps/cad-studio/test/ruled-cylinder-normals-browser.mjs <external-baseline> --baseline
D1290_SOURCE_FROZEN=1 node apps/cad-studio/test/ruled-cylinder-normals-browser.mjs <external-product>
git diff --check
```

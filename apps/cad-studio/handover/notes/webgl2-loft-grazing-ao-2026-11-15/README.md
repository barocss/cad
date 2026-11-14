# D1283 — Remove WebGL2 grazing-angle AO bands in the Loft test

2026-11-15 · SMALL · P4, rows 05 and 06

The left wall of the twisted two-guide Loft showed bands in WebGL2 Right orthographic view. At the same camera, both canonical and refined meshes showed the bands with ambient occlusion enabled. Disabling AO removed them. Enabling it again restored them. The canonical arm changed only the Loft packet choice in the served development module. It left the accepted document and camera unchanged. Rounding the AO sample offsets to the sampled texel alone left the bands visible.

WebGL2 orthographic AO now tapers its contribution as the one-pixel depth gradient grows relative to the world distance across one pixel. The smooth transition spans ratios 1.5 to 4.0. A grazing surface with a steep depth gradient receives a lower contribution where the local plane estimate is unreliable. The ordinary AO control, full effect on low gradients, and the perspective projection path are retained.

- **PASS — grazing-angle Studio check.** With AO on, off, and restored, the same 3,780-pixel patch of the verified wall had a mean absolute horizontal second difference of 0.195503 red-channel levels. Zero pixels had a difference of four levels or more. The old refined mesh with AO on measured 2.843122 and 31.35%. The canonical mesh measured 3.037037 and 33.39%. Screenshots visually confirmed the bands disappear with the corrected AO on.
- **PASS — retained contact shading.** In WebGL2 Iso Ortho, a two-extrusion fixture formed a concave ledge. Enabling AO darkened three lit-plane pixels adjacent to the contact by 47–48 red-channel levels. A point one millimetre from the wall changed by 10 levels, and the control three millimetres away was unchanged.
- **PASS — product regressions.** In WebGL2 and WebGPU, the Loft edge and face picks, outline measure, Guide 2 History edit, Undo, Redo, Save, and fresh Open passed. Verified production build, focused lint, and Git whitespace.
- **FAIL — original appearance.** Both canonical and refined display meshes showed bands with the original shader. The rounded-offset diagnostic still measured 30.45% at four levels or more. Initial temporary diagnostic invocations failed on script syntax and then a served-source match. Corrected diagnostics ran without source writes.
- **NOT_RUN.** Full local suites, mobile, broad WebGL2 visual parity, and independent measurements of perspective AO and other grazing-angle solids.

## Commands and evidence

Node 22.19.0. Both product flows matched 903 frozen source files after cleanup and had zero page or console errors. WebGL2 receipt SHA-256 `9ac3c10d43c0dc8b8a0611ba28f4f3c0bd9de37a60f5ded017fb78ca83cb100a`. WebGPU receipt SHA-256 `e2d4b2652ef6ae8ad9b3d9cf2cedbb9e9fe4003f9d132cdcf09337144b54c9b7`. The canonical diagnostic receipt is `29020a794dac465323b1a814cd532837d5341250fd05a1236225bca63d3faf1a`. The original refined diagnostic receipt is `9b3714ddd8b82e9f7b850bb56cbace3d1e97e614d4fb0f36324dc1892aba4cd3`. The measured ROI was page pixels X=510–537, Y=465–599 at 1440 × 1000 and DPR 1.

```sh
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
pnpm exec eslint apps/cad-studio/src/viewport/renderer.ts apps/cad-studio/test/two-guide-loft-display-browser.mjs
D1282_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-display-browser.mjs <external-webgl2-evidence> --webgl2 --check-ao
D1282_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-display-browser.mjs <external-webgpu-evidence>
git diff --check
```

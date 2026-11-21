# D1545 — Isolate the Model ground shadow on the triangular Smooth Turn

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 0220c5133265ed36e2fb1c5704bbbda8cdc87a3f.

Open the D1544 native −450°, 50 mm triangle. Compare the same Model camera, with AO off, on unmodified WebGPU and WebGL2. In a separate WebGPU browser context, change only the overhead zero-intensity Model light's shadow flag using an intercepted development response. Its default-on image must agree with unmodified Studio before using the test switch. The probe changes no source file or document value.

- **PASS, actual desktop Studio.** The two unmodified backends show similar bands on the side faces. Both use the same camera and the same refined 690-triangle Model packet. In the fixed 420 × 680 pixel crop, disabling the overhead WebGPU shadow changes 23,644 pixels. The ground shadow disappears. The sampled 58,948 foreground pixels and their RGB values remain exact. The sample includes any pixel with every RGB channel at or above 122 in either frame. The injected default and the restored shadow each agree with the corresponding unmodified control crop.
- **PASS, native and affected checks.** The freshly opened document and strict 5-face, 9-edge and 6-vertex native B-rep stay exact. Its digest is f7ca47f91445638b850c7efa26fbfbb029fb7fb6b4fc65f51039e853b81a1d23. Scoped ESLint, browser syntax and Git diff pass. The final browser receipt reports zero runtime errors, console errors and frozen-source changes.
- **FAIL, corrected probe setup.** The first development-response match relied on exact whitespace and aborted before capture. The recovered probe allows the server's formatting and checks that it injected into the intended response. The first comparison expected the shadow toggle to affect foreground pixels. The observed difference was confined to the ground, so the final assertion covers the observed behavior with the brighter of either frame included in the foreground mask.
- **NOT_RUN.** Analytic surface normal versus mesh interpolation, a production rendering change, other viewpoints and triangular STEP exchange, mobile, and full local suites. D1546 compares shared display sampling with native surface derivatives. #630 remains open.

Run with Node 22.19.0 and installed desktop Chrome and Playwright. Use the heavy gate and keep raw captures outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/triangular-turn-model-shadow-browser.mjs
node --check apps/cad-studio/test/triangular-turn-model-shadow-browser.mjs
git diff --check
TURN_SHADOW_FROZEN=1 node apps/cad-studio/test/triangular-turn-model-shadow-browser.mjs "$EVIDENCE" "$D1544/smooth-triangular-turn.bcad"
```

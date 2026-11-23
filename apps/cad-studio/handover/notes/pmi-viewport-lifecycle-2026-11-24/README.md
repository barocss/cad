# D1817 — Qualify annotation picking across WebGPU viewport transitions

P4 Studio interaction, rows 06 and 15. [Issue #268](https://github.com/barocss/cad/issues/268). Base `5048e5c4fcfcfcbe278e26201f3c13ee24da2cee`.

The existing annotation consumer uses the submitted glyph layout. Extend its desktop regression driver for one authored `4× 30 ±0.1234` bracket dimension. Identify occupied glyph pixels from image differences with annotations off and on. Use source telemetry to locate the isolated region and measure the camera, without using the product hit rectangles as the selection oracle.

| Transition | Verified desktop WebGPU result |
| --- | --- |
| CSS canvas resize, DPR1 | At 1440 × 1000, the last glyph probe is (604.5, 674.5) CSS px. At 1060 × 850 it is (432.5, 571.5). The previous pixel misses while the annotation is visible. The current three glyph probes select the annotation. |
| CSS canvas resize, DPR2 | The corresponding last probes move from (603.75, 674.75) to (431.25, 573.25) CSS px. The previous pixel misses, and the current three glyph probes select the annotation. |
| Orbit across the 10° boundary | Public right-drag gives absolute plane-normal dot products 0.1438137523 and 0.2996389175 on opposite sides of 0.1736481777. Three observed glyphs pick on each side. Returning to the facing side retires the former planar glyph pixel. |
| Deliberate device loss and recovery | The viewer-owned GPUDevice emits native `lost` with reason `destroyed`. A different ready device emits the actual recovery callback. Current glyphs select again after recovery with the retained camera and document. No recovery error is emitted. |

Visible selections show the source body's 30 mm X edge in the Inspector. The two orbit modes and recovered state report body 0, edge 2. Clicks retain the exact accepted document, saved state and 2160 mm³ body. The selected annotation remains session state. The final Chrome run records 41 snapshots, 659 frozen files and zero source mutations, browser errors or console errors. Four reviewed scenes go to the existing issue.

- **PASS.** 34 focused Studio tests, scoped ESLint, driver syntax, Git diff check and the desktop WebGPU lifecycle run.
- **FAIL — corrected verification setup.** The first isolated browser driver reached the cold local page navigation time limit. The local test preloader gives the navigation 35 seconds, retains local traffic and serves font substitutes locally. Scoped ESLint found an existing unused destructured raster field. Prefixing that discard binding with an underscore leaves the recorded raster data unchanged.
- **NOT_RUN.** A live backend toggle has no public route. Studio selects WebGL2 on forced startup or WebGPU creation failure. Retain the [separate actual WebGL2 proof](https://github.com/barocss/cad/issues/268#issuecomment-6931591691), the [existing WebGPU glyph and zoom proof](https://github.com/barocss/cad/issues/268#issuecomment-6988729031) and [native Save/fresh Open proof](https://github.com/barocss/cad/issues/268#issuecomment-7059186268). Multi-cell frames, stacked labels and a fresh actual drawing-source Undo/Redo proof are still open. Local production build and full suites, mobile, live providers and organic host failures were not run. #268 remains open. #608 stays held.

This is a test-only change. The first mechanical CAD baseline remains 8/10 accepted. Overall CAD completion remains unmeasured.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright and an external output directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test pmi camera-projector selection-edge
pnpm exec eslint apps/cad-studio/test/pmi-gpu-hit-browser.mjs
node --check apps/cad-studio/test/pmi-gpu-hit-browser.mjs
PMI_GPU_HIT_FROZEN=1 node apps/cad-studio/test/pmi-gpu-hit-browser.mjs "$OUT/lifecycle" --viewport-lifecycle
git diff --check
```

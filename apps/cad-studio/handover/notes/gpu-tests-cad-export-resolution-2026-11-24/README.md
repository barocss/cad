# D1877 — Restore the full GPU test entry point

P0 [row 06](../../roadmap-rows/06.md), [row 20](../../roadmap-rows/20.md), [row 32](../../roadmap-rows/32.md). Base `feeaa6dc05066a15e167951a664a402094d3a54c`. This verification recovery supports [#197](https://github.com/barocss/cad/issues/197).

The existing GPU harnesses now resolve the CAD package through its export map. The old root alias pointed several internal subpaths at nonexistent source files. Update the exposed test fixtures for the current native-edge highlights and rear-edge pick policy. Mount the actual React display controls with the installed DOM test runtime. The change is confined to tests and their runners.

- **FAIL, original full suite.** 269 passes and twelve setup failures. The broad alias bypasses six moved CAD internal exports.
- **FAIL, first alias-only and fixture attempts.** The alias correction allows 84 additional assertions and exposes 18 errors in old fixtures. The fixtures still expected a single highlight, a body halo, front-only X-ray edges and a component that could be called outside React. The first mounted component bundle also used an incompatible React external format. The final harness mounts one native React instance and records its actual DOM inputs and outputs.
- **PASS, complete local GPU test entry.** 365 PASS, 0 FAIL, 0 SKIP. Tests verify native-edge accent colour and non-pickable highlights, front-only picks when requested, rear edges for Wireframe and X-ray, and that the true Display and Isolate controls change the controlled state. Changed runner syntax and Git diff check pass.
- **PASS, actual Chrome Studio WebGPU.** The eight-instance clearance model runs all five display modes. The selected instance stays drawable. Isolation survives clearing selection and restores normally. Clearance and Analysis switch correctly, and the requested Wireframe view returns. Ten states, zero page or console errors, source changes or document edits.
- **NOT_RUN.** Full actual browser matrix, actual WebGL2, mobile, release and downstream Rendering app integration. First mechanical CAD is 8/10. Overall completion remains unmeasured.

```sh
pnpm --dir packages/barocss-gpu test
GPU_DISPLAY_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/gpu-display-smoke-browser.mjs "$OUT/studio"
git diff --name-only -z -- packages/barocss-gpu/tests | xargs -0 -n 1 node --check
git diff --check
```

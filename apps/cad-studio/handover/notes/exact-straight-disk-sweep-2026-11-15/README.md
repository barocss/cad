# D1289 — Sweep a circular disk along a straight path

2026-11-15 · FEATURE with independent geometry checks · P5, rows 07 and 30

Studio Sweep offers **Exact straight path**. The selected Direct curve is copied into the recipe. The Kernel accepts a single open degree-1 span or a single open degree-2 span with a midpoint pole. All weights must be equal. The degree-2 curve can differ from its endpoint segment by at most 0.0000001 mm. The bound is half the midpoint pole error and applies along the full span. The curve has a minimum length of 0.0001 mm. The sketch axes orient the seam and the copied path endpoints place the cylinder and caps. This mode creates a separate solid. Existing circular arc and faceted modes keep their recipes.

- **PASS — desktop Studio.** The Line tool and Make curves produced a degree-2 path, 30 mm long. A real pointer pick on the top box edge and Edge as a curve produced a degree-1 path, 20 mm long. Both workflows copied the directed coordinates, built one new native cylinder, edited the diameter from 4 to 6 mm in Sweep History, and passed Undo, Redo, Save and Open in a fresh context. Reopened volumes were 848.2300164692442 and 565.4866776461629 mm³. The displayed bodies were measured separately using the visible mesh. The D1288 circular arc flow also passed.
- **PASS — geometry and build.** Eleven focused Kernel tests and 40 Model tests pass. With the same tilted endpoints, both encodings give identical B-reps. The independent checks cover volume, centroid, area, bounds, native cap and cylinder normals, pcurves, reversed endpoints, and full-span refusal outside tolerance. Seam and rim normal angles measure 0° and 90° respectively. Kernel and Model type checks, focused lint, code shape and Studio production build pass. The straight Sweep performance case had a seven-run median of 2 ms and fingerprint `a6b75bf2cdf47fc3`. The D1288 arc fingerprint remained `73b778a19685db4f`.
- **FAIL, corrected.** The first focused run stopped at the holed-profile fixture because its side tags were incomplete. The corrected fixture reaches the exact Sweep check and receives its expected refusal.
- **FAIL — display appearance.** The WebGPU perspective screenshots show a lengthwise change in shading on the native cylinders. The shape and mass checks pass. The current run does not isolate display tessellation, normal interpolation and AO. D1290 records the first display stage that introduces the discontinuity on the same cylinder and camera.
- **NOT_RUN.** Full local suites, mobile, WebGL2, downstream Boolean or fillet, longer path chains, public Model API and agent authoring. The broader [exact Sweep issue](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. Final browser runs had zero console errors, page errors or source changes through cleanup.

| Desktop flow | Frozen source files | Receipt SHA-256 |
| --- | ---: | --- |
| Straight Sweep from both Studio authoring routes | 904 | `b43223ee6c55ff6f8298d3ac2d0516c28da2fa7fbe5fe4bc17f0789d5701d73b` |
| D1288 circular arc regression | 905 | `12c4252399a85e7ba9378be5b3bfe1e812e666ee7596ea5b6526a4b8436671d9` |

Save SHA-256 values were `833449d97d99193c38baafa999684f9d1c0de841617d790bab2ecdea1d89c8f6` for the sketched path and `b6c150f8690e657c8d535a6572859b41dc344a8612bf954c79f3a4621119d6db` for the box edge.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-sweep,exact-straight-sweep,sweep-solid,interpolated-hole-sweep-regression,route-bundle-sweep-foundation}.test.mjs
RUNS=7 node packages/barocss-cad/scripts/perf-bench.mjs run native-straight-disk-sweep,native-quarter-arc-sweep
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test route-bundle wire-doc
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
D1289_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-straight-sweep-browser.mjs <external-straight-evidence>
D1288_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-sweep-browser.mjs <external-arc-evidence>
git diff --check
```

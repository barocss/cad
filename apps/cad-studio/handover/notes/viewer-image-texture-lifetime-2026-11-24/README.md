# D1876 — Release disposed Viewer image textures from their owner

P0 [row 06](../../roadmap-rows/06.md), [row 20](../../roadmap-rows/20.md), [row 32](../../roadmap-rows/32.md), [#197](https://github.com/barocss/cad/issues/197). Base `563847a4e3dcd72755950b736ede8a86bf4631d5`.

The stock Viewer's resource registry removes each factory image handle when it is disposed. A synchronous map upload or setup exception destroys the allocated texture before propagating the original exception. A live material that still names a disposed map uses its fallback. The caller controls the source object and can unbind the disposed handle when it is no longer needed.

- **FAIL, original provider.** The 120 distinct RGBA replacements left 122 registered textures with only two active maps. The synchronous upload fault left its partial allocation at zero destroys. The original actual WebGPU sequence reproduced four registered handles for the same two active maps.
- **PASS, bounded resource checks.** 120 unique replacement sources plateau at the two accepted maps and reach zero after final disposal. A shared map on two meshes and one unrelated map remain usable while the replacement is released once. A map disposed before upload allocates nothing. The injected synchronous write failure destroys the partial allocation; retry owns exactly one allocation. Caller RGBA bytes and the caller's image handle remain accessible and the image's close callback is never invoked.
- **PASS, actual Chrome WebGPU.** One shared map draws green on two meshes and one unrelated map draws purple. The replacement changes orange pixels only on its mesh. Disposing it before a queued draw produces the white fallback. A deliberate loss of the test Viewer device recovers exactly two map uploads and the original pixels. Final disposal destroys both recovered textures exactly once and empties the registry. The standalone PNG/JPEG texture controls cover existing colour, wrapping, filtering and recovery.
- **PASS, actual Chrome Studio.** The D710 consumer preserves the chosen body and sibling through invalid or late image deliveries. Actual body texture and environment image render, save and reopen. The desktop run records twelve states with no page errors. The exact GPU source pins agree before and after.
- **PASS, affected checks.** 21 focused GPU tests, the two real Viewer tests, the actual Studio consumer, GPU library build and types, Studio types and production build, scoped lint, syntax and diff check.
- **FAIL, broad GPU invocation.** 269 tests pass. Twelve file-level setups fail before running their assertions. Their esbuild root alias bypasses the CAD package exports for moved internal modules. The next roadmap item addresses this test setup.
- **NOT_RUN.** External Rendering app integration, ordinary unforced device loss, other backends, mobile and release packaging. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-gpu build:library
node --import ./packages/barocss-gpu/tests/cad-dist.mjs --test --test-concurrency=1 packages/barocss-gpu/tests/{viewer-material-bindings,viewer-material-maps,viewer-path-trace-material-maps}.test.mjs
GPU_IMAGE_LIFETIME_EVIDENCE_DIR="$OUT/fixed" node --import "$PLAYWRIGHT_LOCAL_ONLY" --test packages/barocss-gpu/tests/viewer-image-lifetime-browser.test.mjs
GPU_GLB_TEXTURE_EVIDENCE_DIR="$OUT/glb" node --import "$PLAYWRIGHT_LOCAL_ONLY" --test packages/barocss-gpu/tests/viewer-glb-texture-browser.test.mjs
D710_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/render-image-body-file-browser.mjs "$OUT/studio"
pnpm --dir packages/barocss-gpu test
pnpm --dir packages/barocss-gpu type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
git diff --check
```

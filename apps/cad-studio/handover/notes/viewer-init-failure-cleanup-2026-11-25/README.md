# D2002 — Release GPU resources when public Viewer initialization rejects (#196)

Date: 2026-11-25 · Track: P0 Reliability / GPU Viewer · Issue: [#196](https://github.com/barocss/cad/issues/196)

## Decision

Complete ownership-safe cleanup across the entire `createViewer` / `Viewer.create` initialization sequence and `Viewer.dispose()`:

- Track canvas configuration ownership explicitly (`contextConfigured`) so `unconfigure()` runs once only when `configure()` succeeded, and never double-destroys a failed device.
- Release every partial GPU resource created during `start()` (`outputBuffer`, `frameBuffer`, `shadowFrameBuffers`, `whiteTexture`/`white`, `black`, `zeroParams`, `identityInstance`, `emptyShadow`, `emptyFront`, `emptyFrontSamples`, `brdfLut`, `objectBuffer`, pipelines, bloom/focus passes) and clear `device.onuncapturederror` before destroying the failed device.
- Wrap `envPass` temporary uniform buffers in `try/finally` and `OrbitControls` constructor listener attachment in `try/catch` (`this.dispose()` on partial listener registration failure).
- Wrap `Viewer.create()` (`start()`, `OrbitControls`, `ResizeObserver`, and `resize()`) in `try/catch` that calls `v.dispose()` while preserving the original error, so post-`start()` failures release GPU resources, controls, observers, and scheduled frames, mark `disposed = true`, and prevent a late `device.lost` callback from resurrecting the rejected `Viewer`.
- Release `brdfLut`, `oit`, `atlasGpu`, and `zeroUV` in `Viewer.dispose()` so ordinary disposal leaves zero live WebGPU buffers or textures.

## Changes

- `packages/barocss-gpu/src/viewer/viewer.ts`: `contextConfigured` tracking, `releaseStartResources()`, incremental `shadowFrameBuffers` tracking, `envPass` `try/finally`, `Viewer.create()` rejection cleanup, and complete `dispose()` cleanup (`brdfLut`, `oit`, `atlasGpu`, `zeroUV`, `onuncapturederror`).
- `packages/barocss-gpu/src/viewer/controls.ts`: partial-listener cleanup in `OrbitControls` constructor on `addEventListener` throw.
- `packages/barocss-gpu/tests/viewer-device-start-failure.test.mjs` & `packages/barocss-gpu/package.json`: expanded deterministic failure coverage (context null/throw/configure, shader/pipeline/mid-buffer/white-texture/BRDF/object-buffer setup failures, post-`start()` controls/ResizeObserver/resize failures, late `device.lost` non-resurrection, repeated-failure zero accumulation) and registered in `@barocss/gpu`'s `test` script.
- `packages/barocss-gpu/tests/viewer-init-failure-browser.test.mjs`: real Chrome WebGPU verification with an accepted live `Viewer` alongside rejected candidates (`NO_CONTEXT`, mid-start `viewer frame` buffer failure, post-`start()` `ResizeObserver.observe` failure, and 3 repeated failures), proving live devices return to `1` after every rejection and `0` (`0` live buffers, `0` live textures) after accepted disposal while preserving accepted pixel readback.

## Verification

- `@barocss/gpu` `type-check`, `eslint src`, `build:library`: PASS.
- `@barocss/gpu` full unit test suite (Node 22.19.0): **369/369 PASS** (0 fail, 0 skipped), including all 4 deterministic init-failure tests.
- `@barocss/gpu` `test:consumer`: **3/3 PASS**.
- Real Chrome WebGPU browser tests (`--enable-unsafe-webgpu`):
  - `viewer-init-failure-browser.test.mjs`: **PASS** (`devicesBefore: 1`, `afterNullLive: 1`, `afterMid.liveBuffers: 0`, `afterObs`: 19 buffers / 6 textures created → `0` live, `activeListeners: 0`, `obsDisconnects: 1`, `devicesSpawned: 1`, `repeatLives: [1, 1, 1]`, `finalLiveDevices: 0`, `acceptedLiveBuffers: 0`, `acceptedLiveTextures: 0`, accepted readback `[42, 187, 94, 255]` unchanged throughout, `errors: []`).
  - `viewer-device-recovery-failure-browser.test.mjs`: **PASS** (existing device-loss recovery preserved).
  - `viewer-image-lifetime-browser.test.mjs`: **PASS** (existing texture lifecycle preserved).
- Monorepo `pnpm build`: **PASS**.

## Captured WebGPU evidence

- [viewer-init-failure.png](viewer-init-failure.png) — Accepted WebGPU `Viewer` readbacks across baseline, `NO_CONTEXT` rejection, mid-setup + `ResizeObserver` rejections, and 3 repeated rejections (`live devices: 1` throughout, `0` after final `dispose()`).

# CAD Viewer app

A standalone web app for reviewing BaroCSS CAD assets and assemblies. Use the document tree, camera, selection, measurement, and section tools to inspect the loaded model. Use [Studio](../cad-studio) to edit its feature history.

## Start Viewer

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm dev:viewer
```

Open [CAD Viewer](http://127.0.0.1:53032) in a desktop browser with WebGPU support. Override the local port with `CAD_VIEWER_PORT`.

The app uses [the Viewer SDK](../../packages/barocss-viewer), CAD Interop, and the GPU renderer. The development server uses the current workspace sources. Its `/input-audit.json` endpoint records the bundle inputs.

## Validate locally

```sh
pnpm build:viewer
pnpm --filter @barocss/cad-viewer-app type-check
```

See the [Viewer SDK reference](../library-docs/docs/packages/viewer/index.md), [sectioning guide](SECTIONING.md), and [app roadmap](ROADMAP.md).

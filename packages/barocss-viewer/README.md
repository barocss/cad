# @barocss/viewer

An embeddable CAD review SDK built on the BaroCSS WebGPU renderer. It loads supported native CAD inputs or display meshes and provides camera controls, picking, selection, and measurement.

## Use in this workspace

Add `"@barocss/viewer": "workspace:*"` to a workspace consumer. The host supplies a canvas in a browser with WebGPU support.

```ts
import { createViewer } from '@barocss/viewer';

export async function openSource(canvas: HTMLCanvasElement, source: string) {
  const viewer = await createViewer(canvas, {
    mmToSceneUnit: 0.001,
    background: [0.04, 0.06, 0.1],
  });
  try {
    viewer.loadNative(source, { sourceVersion: 0, countU: 8, countV: 8 });
    viewer.fit();
    return viewer;
  } catch (error) {
    viewer.dispose();
    throw error;
  }
}
```

Use `pick(x, y)` with canvas-local CSS pixels. Call `attachPointerControls()` if the viewer should handle camera gestures. Dispose of the controls and viewer when removing the canvas.

Native inspection needs the supported native source and references. Display-only meshes support review of the rendered geometry. Build and edit feature history with CAD Model or Studio.

```sh
pnpm --filter @barocss/viewer type-check
pnpm --filter @barocss/viewer build:library
pnpm --filter @barocss/viewer test
```

[Viewer reference](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/viewer/index.md) · [Viewer app](https://github.com/barocss/cad/tree/main/apps/cad-viewer) · [License](LICENSE)

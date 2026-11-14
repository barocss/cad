# @barocss/gpu

A WebGPU renderer and scene API for drawing CAD meshes and other geometry on a canvas. Use it to create render scenes, control the camera and materials, and pick geometry. Use `@barocss/viewer` for CAD document review and native selection references.

## Use in this workspace

Add `"@barocss/gpu": "workspace:*"` to a workspace consumer. Rendering requires a browser and device with WebGPU support. The CAD Studio app supplies its own WebGL2 fallback.

```ts
import { part } from '@barocss/cad/api';
import { scene, show } from '@barocss/gpu/api';
import { createViewer } from '@barocss/gpu/viewer';

export async function renderPart(canvas: HTMLCanvasElement) {
  const model = part('Block').box({ w: 30, d: 20, h: 10 });
  const viewer = await createViewer(canvas);
  show(viewer, scene().add(model.meshes(), { color: '#c8ccd2' }, { lines: true }));
  return viewer;
}
```

Dispose of the returned viewer when removing the canvas. Submit new meshes after changing the CAD model.

| Import | Purpose |
| --- | --- |
| `@barocss/gpu` | Scene data, mesh contracts, compiler, and backend services. |
| `@barocss/gpu/api` | Immutable scene composition and `show()`. |
| `@barocss/gpu/source` | Source API for the scene language. |
| `@barocss/gpu/viewer` | Canvas renderer, camera, picking, and GPU resource lifecycle. |

```sh
pnpm --filter @barocss/gpu type-check
pnpm --filter @barocss/gpu build:library
```

[GPU reference](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/gpu/index.md) · [Examples](https://github.com/barocss/cad/tree/main/examples/gpu-scene) · [License](LICENSE)

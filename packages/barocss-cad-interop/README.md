# @barocss/cad-interop

Load CAD assets, prepare display geometry, and transfer it to a renderer. Keep native source and its references for CAD inspection. The package also exports GLB previews for applications that need display geometry.

## Use in this workspace

Add `"@barocss/cad-interop": "workspace:*"` to a workspace consumer. Build the package to produce its JavaScript and declaration files. Install a renderer peer only if you use its adapter, and match the peer requirements in the package manifest.

```ts
import { encodeCadPreviewGlb } from '@barocss/cad-interop';

const packet = {
  version: 0,
  surfaceId: 'panel',
  revision: 0,
  lengthUnit: 'mm',
  coordinateSystem: 'right-handed-z-up',
  winding: 'ccw',
  positions: [0, 0, 0, 30, 0, 0, 30, 20, 0, 0, 20, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2, 0, 2, 3],
  parameters: [0, 0, 1, 0, 1, 1, 0, 1],
  bounds: { min: [0, 0, 0], max: [30, 20, 0] },
};

const previewGlb = encodeCadPreviewGlb(packet); // ArrayBuffer
```

| Import suffix | Purpose |
| --- | --- |
| Package root | Validate and copy a preview packet, prepare mesh buffers, and encode GLB. |
| `/native` | Load supported native CAD source. |
| `/document`, `/assembly`, `/model-set` | Work with document, assembly, and model-set inputs. |
| `/three`, `/babylon`, `/pixi3d` | Adapt supported geometry to a renderer with its optional peer dependency. |

Preview packets use right-handed Z-up coordinates in millimetres. A GLB contains display geometry. Keep the original CAD data for topology, precise geometry queries, and feature edits.

```sh
pnpm --filter @barocss/cad-interop test
```

[Examples](https://github.com/barocss/cad/tree/main/packages/barocss-cad-interop/examples) · [Native loader and interop manual](https://github.com/barocss/cad/wiki) · [License](LICENSE)

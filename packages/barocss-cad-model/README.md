# @barocss/cad-model

The document and engineering layer of BaroCSS CAD. It builds on the CAD kernel and supplies the editable model used by Studio, including parts, assemblies, drawings, materials, bills of materials, engineering checks, and agent tools. It runs without a browser UI.

## Use in this workspace

Add `"@barocss/cad-model": "workspace:*"` to a workspace consumer. The package exposes TypeScript modules by path. Use a bundler or runtime that resolves the package's TypeScript sources.

```ts
import { param, part } from '@barocss/cad-model/api';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';

const plate = part('Plate')
  .parameter('Thickness', 6)
  .box({ w: 80, d: 50, h: param('Thickness') });

const bytes = encodeStudioFile(plate.doc);
const opened = await readStudioFile(bytes);
if ('doc' in opened) {
  const restored = part('Plate', opened.doc);
  console.log(restored.parameters().Thickness); // 6
}
```

| Import | Purpose |
| --- | --- |
| `@barocss/cad-model/api` | Build and inspect parts, assemblies, and robot definitions. |
| `@barocss/cad-model/engine/evaluate` | Evaluate Studio documents into bodies and display data. |
| `@barocss/cad-model/engine/container` | Encode and read Studio `.bcad` files. |
| `@barocss/cad-model/drawing` modules | Work with views, dimensions, tolerances, and drawing output. |

Studio owns the UI, browser project storage, and review workflow. Keep the editable Studio document if you need its feature history and stable references.

```sh
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-model test api-variable-fillet
```

[Package reference](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/cad-model/index.md) · [Document schema](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/reference/document.md) · [Agent tools](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/agent/tools.md) · [License](LICENSE)

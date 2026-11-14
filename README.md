# BaroCSS CAD

BaroCSS CAD is a TypeScript CAD system for designing editable parts, reviewing geometry, and working with AI agents. It includes a native B-rep and NURBS kernel, a browser-based Studio, a standalone Viewer, and libraries for embedding CAD in other applications.

## Run from source

Use Node.js **22.19.0** and pnpm **9.15.4**.

```sh
git clone https://github.com/barocss/cad.git
cd cad
pnpm install --frozen-lockfile
pnpm dev
```

Open [Studio](http://127.0.0.1:52020) to sketch and model parts, edit feature history, and save native `.bcad` documents. Use `pnpm dev:viewer` for the independent [Viewer](http://127.0.0.1:53032) or `pnpm dev:docs` for the documentation site.

## Libraries

| Package | Use it to |
| --- | --- |
| [`@barocss/cad`](packages/barocss-cad) | Build and inspect solids, evaluate NURBS geometry, and exchange CAD files. |
| [`@barocss/cad-model`](packages/barocss-cad-model) | Work with editable Studio documents, assemblies, drawings, engineering checks, and agent tools. |
| [`@barocss/cad-react`](packages/barocss-cad-react) | Compose CAD profiles and solids with React and display results through an existing Viewer. |
| [`@barocss/cad-interop`](packages/barocss-cad-interop) | Load native assets, adapt geometry to other renderers, and export GLB previews. |
| [`@barocss/gpu`](packages/barocss-gpu) | Render meshes and scenes with WebGPU. |
| [`@barocss/viewer`](packages/barocss-viewer) | Embed a CAD review canvas with selection and geometry inspection. |
| [`@barocss/physics`](packages/barocss-physics) | Advance supported rigid-body, visual cloth, and visual water models at a fixed time step. |

The current setup uses workspace packages. Each package README lists its entry points and how to validate it locally.

## Model a part in TypeScript

```ts
import { param, part } from '@barocss/cad/api';

const plate = part('Plate')
  .parameter('Thickness', 6)
  .box({ w: 80, d: 50, h: param('Thickness') });

const thicker = plate.withParameters({ Thickness: 8 });
console.log(thicker.mass({ density: 2.7 }).volume); // 32000 mm³
```

## Work with an agent

Run the local MCP server against a document path. It uses the same modeling tools as Studio. Saved proposals can be opened and reviewed in Studio.

```sh
node apps/cad-studio/scripts/cad-mcp.mjs --doc ./part.bcad
```

The [MCP and CLI guide](apps/library-docs/docs/agent/cli.md) covers tools, autonomy settings, and scripting.

## Develop

```sh
pnpm build
pnpm build:viewer
pnpm build:docs
pnpm --filter @barocss/cad test:api-smoke
```

See the [documentation](apps/library-docs/docs/index.md), [roadmap](apps/cad-studio/handover/roadmap.md), [decision log](apps/cad-studio/handover/decisions.md), and [repository migration](docs/migration/README.md). Report defects in [CAD Issues](https://github.com/barocss/cad/issues).

## License

[MIT](LICENSE). Copyright (c) 2026 easylogic.

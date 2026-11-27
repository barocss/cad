# @barocss/cad

A TypeScript CAD kernel for boundary-representation (B-rep) solids, NURBS curves and surfaces, and file exchange. Use the object API to build parts in code or the core API to evaluate and inspect feature documents. The kernel has no runtime dependencies.

## Use in this workspace

Add `"@barocss/cad": "workspace:*"` to a workspace consumer. Use a TypeScript-aware bundler for source imports. The library build emits JavaScript and declarations for distribution.

```ts
import { part, sketch } from '@barocss/cad/api';

const profile = sketch().rectangle({ w: 60, d: 40 });
const plate = part('Plate').extrude(profile, { h: 8 });

console.log(plate.mass({ density: 2.7 }).volume); // 19200 mm³
const nativeDocument = plate.doc;
const stepText = plate.step();
```

## Entry points

| Import | Purpose |
| --- | --- |
| `@barocss/cad/api` | Immutable part builder, sketches, named face and edge selectors, parameters, and typed refusals. |
| `@barocss/cad` | Feature-document evaluation, B-rep and NURBS operations, mass properties, tessellation, and supported exchange formats. |

Lengths in the part API are in millimetres, angles are in degrees, and density is in g/cm³. Geometry support depends on the input topology and surface types. Check the operation's documented limits and handle typed refusals. Use native results for geometry and mass checks. Use the mesh for display or mesh export.

## Read Split face and edge history

Use `splitTopologyEvolutionOf(snapshot, splitId)` with a snapshot from `evaluateCadPart`. A coordinate-plane Split of an original zero-draft rectangular extrusion reports the retained, modified and deleted faces and edges for each output. It also identifies the two generated caps and their boundary edges.

Pass an original `{ kind, id }` from `receipt.sources` to `resolveSplitTopologySource(receipt, source)`. A source that survives on both sides resolves to `ambiguous`. Pass `'negative'` or `'positive'` as a third argument when the design specifies one side. The returned IDs belong to that evaluated source or output. Unsupported Split inputs raise a `CadPartError`.

## Validate locally

```sh
pnpm --filter @barocss/cad type-check
pnpm --filter @barocss/cad build:library
pnpm --filter @barocss/cad test:api-smoke
```

[Modeling API](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/cad/modeling.md) · [Object API](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/api.md) · [Exchange formats](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/cad/formats.md) · [License](LICENSE)

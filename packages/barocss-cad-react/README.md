# @barocss/cad-react

Compose editable CAD geometry with React components. A `Part` collects committed geometry declarations and forwards them to a host. The host evaluates them through CAD Model and can display the result through the BaroCSS Viewer.

## Use in this workspace

CAD React is available as private workspace source. Use React and React DOM **19.2.3** and add `"@barocss/cad-react": "workspace:*"` to a workspace consumer. The application supplies the engine connection, worker lifecycle, and mass policy.

```tsx
import {
  Circle, Difference, Extrude, Part, Rectangle, Target, Tools,
  type ModelLifecycle,
} from '@barocss/cad-react';

export function DrilledPlate({ width, lifecycle }: {
  width: number;
  lifecycle: ModelLifecycle;
}) {
  return (
    <Part admission="synchronous" units="mm" lifecycle={lifecycle}>
      <Difference>
        <Target>
          <Extrude distance={6}>
            <Rectangle min={[0, 0]} max={[width, 60]} />
          </Extrude>
        </Target>
        <Tools>
          <Extrude from={-1} distance={8}>
            <Circle center={[10, 10]} radius={3} />
          </Extrude>
        </Tools>
      </Difference>
    </Part>
  );
}
```

Changing `width` updates the committed model through the host. Use `Definitions` and typed object refs when several branches need the same geometry. Ordinary nested geometry does not need manual IDs.

| Import | Purpose |
| --- | --- |
| `@barocss/cad-react` | Profiles, extrusion, revolution, Boolean composition, and transforms. |
| `@barocss/cad-react/engine` | `ModelHost` and contracts for a host-supplied engine. |
| `@barocss/cad-react/viewer` | `ExistingViewerHost` adapter for displaying result meshes. |

```sh
pnpm --filter @barocss/cad-react test
pnpm --filter @barocss/cad-react test:types
```

[Component catalog](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/cad-react/components.md) · [Engine and Viewer setup](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/cad-react/engine-viewer.md) · [Examples](https://github.com/barocss/cad/tree/main/packages/barocss-cad-react/examples) · [License](LICENSE)

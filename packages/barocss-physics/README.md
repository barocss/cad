# @barocss/physics

A renderer-independent, fixed-step simulation library. Use it for supported rigid-body scenes, visual cloth or water profiles, and upright capsule queries. The host provides the model, advances the clock, and displays accepted states.

## Use in this workspace

Add `"@barocss/physics": "workspace:*"` to a workspace consumer. Start with a complete `PhysicsModel` from the [free-body example](https://github.com/barocss/cad/blob/main/apps/library-docs/samples/physics-docs.test.mjs) and select a profile that supports your inputs.

```ts
import { createPhysicsWorld, type PhysicsModel } from '@barocss/physics';

export function stepOnce(model: PhysicsModel) {
  const world = createPhysicsWorld(model, {
    profile: 'rigid-discrete-v1',
    fixedStepSeconds: 1 / 120,
    broadPhase: 'direct',
  });

  try {
    return world.step();
  } finally {
    world.dispose();
  }
}
```

Use SI inputs: metres, kilograms, seconds, and radians. Keep CAD-to-SI conversion at the host boundary. For a CAD proxy, retain the source revision and use supported collision geometry. Check the selected profile's limits for contact, joints, or continuous collision handling.

| Import | Purpose |
| --- | --- |
| `@barocss/physics` | Create a world, read accepted states, and run capsule queries and controllers. |
| `@barocss/physics/cad-proxy` | Admit supported CAD source for collision proxies and derive poses. |
| `@barocss/physics/replay` | Record, serialize, restore, and continue a supported world. |

```sh
pnpm --filter @barocss/physics build:library
```

[Profiles and lifecycle](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/physics/profiles-and-lifecycle.md) · [Host integration](https://github.com/barocss/cad/blob/main/apps/library-docs/docs/packages/physics/host-integration.md) · [Examples](https://github.com/barocss/cad/tree/main/examples) · [License](LICENSE)

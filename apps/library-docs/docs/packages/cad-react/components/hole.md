# Hole

Cuts one solid with the existing native Hole operation. Import Hole and HoleProps from @barocss/cad-react. This is a private workspace API.

| Prop | Contract |
|---|---|
| center | Required dense finite coordinate pair in mm. Axis z uses XY; x uses YZ; y uses ZX. |
| radius | Required positive finite mm. |
| axis | Optional x, y or z. Omission keeps the native z default. |
| side | Optional min or max along the axis. Omission keeps native max. |
| depth | Optional positive finite mm. Omit for through; supplied depth uses the existing flat-bottom cut. |
| children / solid | Exactly one realized solid child or SolidRef, exclusive. |
| ref | Optional SolidRef for the resulting Hole. |

```tsx
import { Hole, Extrude, Rectangle } from '@barocss/cad-react';

export function BlindPlate({depth = 6}: {depth?: number}) {
  return <Hole center={[30,20]} radius={4} depth={depth}>
    <Extrude distance={20}><Rectangle min={[0,0]} max={[60,40]} /></Extrude>
  </Hole>;
}
```

Place this output inside Part with a connected lifecycle. A solid ref can replace the child, including a forward ref declared inside Definitions. Mounted identity follows the existing scoped solid rules.

The compiler checks numeric inputs, input kind, cardinality and reference ownership. Native code decides whether the cut fits its stock. It receives omitted fields unchanged. Invalid declarations retain the preceding accepted document and frame while retiring freshness; valid recovery submits current geometry again.

A flat-bottom Hole differs from the native blind-drill-hole operation with a drill point. No face selection, thread, pattern, countersink, drill angle or manual native ID is exposed here. A solid output can contain native pieces; this component adds no universal connected-solid guarantee.

The desktop verification changes the blind depth and radius in React, checks the current native body and Viewer frame, then edits and reopens the returned Hole in Studio. The through and alternate-axis props have focused compiler coverage. This desktop verification uses one upper-face blind Hole.

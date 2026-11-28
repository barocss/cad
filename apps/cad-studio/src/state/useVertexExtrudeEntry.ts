import { useRef, type MouseEvent } from 'react';
import type { VertexSel } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { createHistoryFeatureNavigation } from './useHistoryEditorSession';

interface VertexExtrudeEntry {
  doc: StudioDoc;
  bodies: readonly BodyResult[];
  vertex?: VertexSel;
  editNode: number | null;
  canOpen(): boolean;
  open: ReturnType<typeof createHistoryFeatureNavigation>['openHistoryFeatureAt'];
}

/** Route a current native corner of original rectangular stock to its existing feature editor. */
export function useVertexExtrudeEntry({ doc, bodies, vertex, editNode, canOpen, open }: VertexExtrudeEntry) {
  const body = vertex && bodies[vertex.body];
  const ref = body?.ref;
  const extrusion = ref?.side === 'solid' ? doc.nodes[ref.node] : undefined;
  const sketch = extrusion?.kind === 'extrude' ? doc.nodes[extrusion.sketch] : undefined;
  const target = vertex && body?.mesh.faces.length === 6 && ref && extrusion?.kind === 'extrude'
    && extrusion.cutDepth === undefined && (extrusion.draft === undefined || extrusion.draft === 0)
    && sketch?.kind === 'sketch' && sketch.profile === 'rectangle' && !sketch.plane && !sketch.on && !sketch.association
    && !sketch.pocketFloor && !sketch.holes?.length && !sketch.regions?.length
    ? { doc, body, vertex, index: ref.node } : undefined;
  const latest = useRef(target);
  latest.current = target;
  if (!target) return undefined;
  const owns = () => latest.current?.doc === doc && latest.current.body === body && latest.current.vertex === vertex
    && latest.current.index === target.index && canOpen();
  return { disabled: editNode !== null, open: (event: MouseEvent<HTMLButtonElement>) => open(target.index, event, owns) };
}

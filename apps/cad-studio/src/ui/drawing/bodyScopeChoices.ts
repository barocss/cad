import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { checkDrawingBodyOwner, type DrawingBodySelector } from '@barocss/cad-model/drawing/scope';

/** No viewport selection/visibility input: only the current native evaluation may offer a key. */
export function drawingBodyChoices(doc: StudioDoc, bodies: readonly BodyResult[]): DrawingBodySelector[] {
  return bodies.flatMap(body => {
    if (body.topology?.kind !== 'solid' || body.topology.openShells !== 0 || body.topology.boundaryEdges !== 0 || body.ref?.side !== 'solid') return [];
    if (bodies.filter(b => b.key === body.key).length !== 1) return [];
    const node = doc.nodes[body.ref.node];
    if (!node?.id || (node.kind !== 'extrude' && node.kind !== 'revolve')) return [];
    const selector: DrawingBodySelector = { key: body.key, feature: node.id, kind: node.kind };
    return checkDrawingBodyOwner(doc, selector).length ? [] : [selector];
  });
}
export interface DrawingBodyChoices {
  readonly owner: object;
  readonly doc: StudioDoc;
  readonly ready: boolean;
  readonly choices: readonly DrawingBodySelector[];
}

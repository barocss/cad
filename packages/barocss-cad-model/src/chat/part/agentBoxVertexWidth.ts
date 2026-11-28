import { isEditableBox } from '../../app/editCommand';
import { nativeSolidLine } from '../../app/nativeSolidLine';
import type { ModelNode } from '../../engine/doc';
import type { Op } from '../../engine/schema/proposals';
import { isObj } from '../../util/guards';
import type { ChatState } from '../toolKit';

const fields = ['boxVertexEdge', 'boxVertexEndpoint', 'boxMaxX'] as const;
export const BOX_VERTEX_WIDTH_APPROVAL = 'Box vertex width edit';

export const hasBoxVertexWidthValues = (values: Record<string, unknown>) => fields.some(key => Object.hasOwn(values, key));

export function isBoxVertexWidthOperation(op: Op): boolean {
  return op.tool === 'edit_feature' && isObj(op.args?.values) && hasBoxVertexWidthValues(op.args.values);
}

/** Resolve a named original corner before handing the authored sketch to the existing Box editor. */
export function boxVertexWidthSketch(state: ChatState, args: Record<string, unknown>, values: Record<string, unknown>):
{ feature: ModelNode } | { error: string } {
  const { boxVertexEdge, boxVertexEndpoint, boxMaxX } = values;
  if (args.index !== 0 || typeof args.expectedRevision !== 'string' || args.feature !== undefined
    || args.retainBoxCommand !== undefined || args.sketchChamfer !== undefined || args.sketchRound !== undefined
    || Object.keys(values).length !== fields.length || !fields.every(field => Object.hasOwn(values, field))
    || typeof boxVertexEdge !== 'string' || !boxVertexEdge || (boxVertexEndpoint !== 'from' && boxVertexEndpoint !== 'to')
    || typeof boxMaxX !== 'number' || !Number.isFinite(boxMaxX)) {
    return { error: 'A Box vertex width edit needs index 0, the current expectedRevision, one original boxVertexEdge, boxVertexEndpoint from or to, and the absolute boxMaxX in mm.' };
  }
  const { nodes, instances } = state.doc;
  const [sketch, extrusion] = nodes, [body] = state.bodies;
  if (state.partOf || instances?.length || nodes.length !== 2 || state.bodies.length !== 1 || body?.ref?.node !== 1
    || sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || extrusion?.kind !== 'extrude' || !isEditableBox(nodes, 0)) {
    return { error: 'A Box vertex width edit needs one original standalone authored Box.' };
  }
  const [minX, minY] = sketch.min, [maxX, maxY] = sketch.max, bottom = extrusion.from ?? 0;
  const edgeIndex = body.mesh.edges.findIndex(edge => edge.names.includes(boxVertexEdge));
  const edge = nativeSolidLine(body, edgeIndex), point = boxVertexEndpoint === 'from' ? edge?.a : edge?.b;
  if (!point || edge?.names[0] !== boxVertexEdge || typeof bottom !== 'number' || typeof extrusion.height !== 'number'
    || point[0] !== maxX || (point[1] !== minY && point[1] !== maxY) || (point[2] !== bottom && point[2] !== bottom + extrusion.height)) {
    return { error: 'Choose one exact native edge endpoint on the original +X face of the Box.' };
  }
  if (boxMaxX === maxX) return { error: 'The Box endpoint already lies on the requested X plane.' };
  if (typeof minX !== 'number' || boxMaxX < minX + 1) return { error: 'The requested X plane must leave at least 1 mm of Box width.' };
  return { feature: { ...sketch, max: [boxMaxX, maxY] } };
}

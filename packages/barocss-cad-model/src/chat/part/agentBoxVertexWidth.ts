import { isEditableBox } from '../../app/editCommand';
import { nativeSolidLine } from '../../app/nativeSolidLine';
import type { ModelNode } from '../../engine/doc';
import type { BodyResult } from '../../engine/evaluate';
import type { Op } from '../../engine/schema/proposals';
import { isObj } from '../../util/guards';
import type { ChatState } from '../toolKit';

const sourceFields = ['boxVertexEdge', 'boxVertexEndpoint'] as const;
const scalarFields = [...sourceFields, 'boxMaxX'] as const;
const targetFields = ['boxTargetVertexEdge', 'boxTargetVertexEndpoint'] as const;
const referenceFields = [...sourceFields, ...targetFields] as const;
export const BOX_VERTEX_WIDTH_APPROVAL = 'Box vertex width edit';

const hasTarget = (values: Record<string, unknown>) => targetFields.some(key => Object.hasOwn(values, key));
export const hasBoxVertexWidthValues = (values: Record<string, unknown>) =>
  scalarFields.some(key => Object.hasOwn(values, key)) || hasTarget(values);

export function isBoxVertexWidthOperation(op: Op): boolean {
  return op.tool === 'edit_feature' && isObj(op.args?.values) && hasBoxVertexWidthValues(op.args.values);
}

function originalBox(nodes: readonly ModelNode[], index: number) {
  const sketch = nodes[index], extrusion = nodes[index + 1];
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || extrusion?.kind !== 'extrude'
    || !isEditableBox(nodes, index)) return;
  return { sketch, extrusion };
}

type OriginalBox = NonNullable<ReturnType<typeof originalBox>>;
const isEdge = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isEndpoint = (value: unknown): value is 'from' | 'to' => value === 'from' || value === 'to';

function originalCorner(box: OriginalBox, body: BodyResult, name: string, endpoint: 'from' | 'to') {
  const { sketch, extrusion } = box;
  const [minX, minY] = sketch.min, [maxX, maxY] = sketch.max, bottom = extrusion.from ?? 0;
  const edge = nativeSolidLine(body, body.mesh.edges.findIndex(item => item.names.includes(name)));
  const point = endpoint === 'from' ? edge?.a : edge?.b;
  if (!point || edge?.names[0] !== name || typeof bottom !== 'number' || typeof extrusion.height !== 'number'
    || (point[0] !== minX && point[0] !== maxX) || (point[1] !== minY && point[1] !== maxY)
    || (point[2] !== bottom && point[2] !== bottom + extrusion.height)) return;
  return point;
}

/** Resolve named corners of original Boxes, then pass one authored sketch to the ordinary Box editor. */
export function boxVertexWidthSketch(state: ChatState, args: Record<string, unknown>, values: Record<string, unknown>):
{ feature: ModelNode } | { error: string } {
  const { boxVertexEdge, boxVertexEndpoint, boxTargetVertexEdge, boxTargetVertexEndpoint, boxMaxX } = values;
  const reference = hasTarget(values), fields = reference ? referenceFields : scalarFields;
  if (args.index !== 0 || typeof args.expectedRevision !== 'string' || args.feature !== undefined
    || args.retainBoxCommand !== undefined || args.sketchChamfer !== undefined || args.sketchRound !== undefined
    || Object.keys(values).length !== fields.length || !fields.every(field => Object.hasOwn(values, field))
    || !isEdge(boxVertexEdge) || !isEndpoint(boxVertexEndpoint)) {
    return { error: 'A Box vertex width edit needs index 0, the current expectedRevision, one original boxVertexEdge, boxVertexEndpoint from or to, and either boxMaxX in mm or both target vertex fields.' };
  }

  const { nodes, instances } = state.doc;
  const count = reference ? 2 : 1;
  const body = state.bodies.find(item => item.ref?.node === 1), source = originalBox(nodes, 0);
  if (state.partOf || instances?.length || nodes.length !== 2 * count || state.bodies.length !== count || !body || !source) {
    return { error: reference ? 'A target vertex width edit needs two independent original authored Boxes.' : 'A Box vertex width edit needs one original standalone authored Box.' };
  }

  const { sketch } = source;
  const [minX] = sketch.min, [maxX, maxY] = sketch.max;
  const point = originalCorner(source, body, boxVertexEdge, boxVertexEndpoint);
  if (!point || point[0] !== maxX) {
    return { error: 'Choose one exact native edge endpoint on the original +X face of the Box.' };
  }

  let targetX: number;
  if (reference) {
    const target = originalBox(nodes, 2), targetBody = state.bodies.find(item => item.ref?.node === 3);
    if (!target || !targetBody) return { error: 'A target vertex width edit needs two independent original authored Boxes.' };
    if (!isEdge(boxTargetVertexEdge) || !isEndpoint(boxTargetVertexEndpoint))
      return { error: 'Pass boxTargetVertexEdge and boxTargetVertexEndpoint from or to.' };
    const corner = originalCorner(target, targetBody, boxTargetVertexEdge, boxTargetVertexEndpoint);
    if (!corner) return { error: 'Choose one exact native edge endpoint on the second original Box.' };
    targetX = corner[0];
  } else {
    if (typeof boxMaxX !== 'number' || !Number.isFinite(boxMaxX)) return { error: 'boxMaxX must be a finite X coordinate in mm.' };
    targetX = boxMaxX;
  }

  if (targetX === maxX) return { error: 'The Box endpoint already lies on the requested X plane.' };
  if (typeof minX !== 'number' || targetX < minX + 1) return { error: 'The requested X plane must leave at least 1 mm of Box width.' };
  return { feature: { ...sketch, max: [targetX, maxY] } };
}

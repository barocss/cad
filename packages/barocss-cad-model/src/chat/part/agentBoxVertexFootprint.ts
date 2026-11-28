import { isOriginalBoxCorner, originalBox, type OriginalBox } from '../../app/originalBoxCorners';
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
const depthFields = [...referenceFields, 'boxVertexAxis'] as const;

const hasTarget = (values: Record<string, unknown>) => targetFields.some(key => Object.hasOwn(values, key));
export const hasBoxVertexFootprintValues = (values: Record<string, unknown>) =>
  scalarFields.some(key => Object.hasOwn(values, key)) || hasTarget(values) || Object.hasOwn(values, 'boxVertexAxis');

export function boxVertexFootprintDimension(op: Op): 'width' | 'depth' | undefined {
  const values = op.args?.values;
  if (op.tool === 'edit_feature' && isObj(values) && hasBoxVertexFootprintValues(values))
    return values.boxVertexAxis === 'y' ? 'depth' : 'width';
}

const isEdge = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isEndpoint = (value: unknown): value is 'from' | 'to' => value === 'from' || value === 'to';

function originalCorner(box: OriginalBox, body: BodyResult, name: string, endpoint: 'from' | 'to') {
  const edge = nativeSolidLine(body, body.mesh.edges.findIndex(item => item.names.includes(name)));
  const point = endpoint === 'from' ? edge?.a : edge?.b;
  if (!point || edge?.names[0] !== name || !isOriginalBoxCorner(box, point)) return;
  return point;
}

/** Resolve named corners of original Boxes, then pass one authored sketch to the ordinary Box editor. */
export function boxVertexFootprintSketch(state: ChatState, args: Record<string, unknown>, values: Record<string, unknown>):
{ feature: ModelNode } | { error: string } {
  const { boxVertexEdge, boxVertexEndpoint, boxTargetVertexEdge, boxTargetVertexEndpoint, boxMaxX, boxVertexAxis } = values;
  if (Object.hasOwn(values, 'boxVertexAxis') && boxVertexAxis !== 'y')
    return { error: 'For a depth edit, set boxVertexAxis to y and pick a corner of the second Box.' };
  const depth = boxVertexAxis === 'y', axis = depth ? 1 : 0;
  const coordinate = depth ? 'Y' : 'X', dimension = depth ? 'depth' : 'width';
  const reference = depth || hasTarget(values), fields = depth ? depthFields : reference ? referenceFields : scalarFields;
  if (args.index !== 0 || typeof args.expectedRevision !== 'string' || args.feature !== undefined
    || args.retainBoxCommand !== undefined || args.sketchChamfer !== undefined || args.sketchRound !== undefined
    || Object.keys(values).length !== fields.length || !fields.every(field => Object.hasOwn(values, field))
    || !isEdge(boxVertexEdge) || !isEndpoint(boxVertexEndpoint)) {
    if (depth) return { error: 'A Box vertex depth edit needs index 0, the current expectedRevision, boxVertexAxis y, and both original edge endpoints.' };
    return { error: 'A Box vertex width edit needs index 0, the current expectedRevision, one original boxVertexEdge, boxVertexEndpoint from or to, and either boxMaxX in mm or both target vertex fields.' };
  }

  const { nodes, instances } = state.doc;
  const count = reference ? 2 : 1;
  const body = state.bodies.find(item => item.ref?.node === 1), source = originalBox(nodes, 0);
  if (state.partOf || instances?.length || nodes.length !== 2 * count || state.bodies.length !== count || !body || !source) {
    return { error: reference ? `A target vertex ${dimension} edit needs two independent original authored Boxes.` : 'A Box vertex width edit needs one original standalone authored Box.' };
  }

  const { sketch } = source;
  const min = sketch.min[axis], maxCurrent = sketch.max[axis];
  const point = originalCorner(source, body, boxVertexEdge, boxVertexEndpoint);
  if (!point || point[axis] !== maxCurrent) {
    return { error: `Choose one exact native edge endpoint on the original +${coordinate} face of the Box.` };
  }

  let targetCoordinate: number;
  if (reference) {
    const target = originalBox(nodes, 2), targetBody = state.bodies.find(item => item.ref?.node === 3);
    if (!target || !targetBody) return { error: `A target vertex ${dimension} edit needs two independent original authored Boxes.` };
    if (!isEdge(boxTargetVertexEdge) || !isEndpoint(boxTargetVertexEndpoint))
      return { error: 'Pass boxTargetVertexEdge and boxTargetVertexEndpoint from or to.' };
    const corner = originalCorner(target, targetBody, boxTargetVertexEdge, boxTargetVertexEndpoint);
    if (!corner) return { error: 'Choose one exact native edge endpoint on the second original Box.' };
    targetCoordinate = corner[axis];
  } else {
    if (typeof boxMaxX !== 'number' || !Number.isFinite(boxMaxX)) return { error: 'boxMaxX must be a finite X coordinate in mm.' };
    targetCoordinate = boxMaxX;
  }

  if (targetCoordinate === maxCurrent) return { error: `The Box endpoint already lies on the requested ${coordinate} plane.` };
  if (typeof min !== 'number' || targetCoordinate < min + 1)
    return { error: `The requested ${coordinate} plane must leave at least 1 mm of Box ${dimension}.` };
  const max = [...sketch.max] as typeof sketch.max;
  max[axis] = targetCoordinate;
  return { feature: { ...sketch, max } };
}

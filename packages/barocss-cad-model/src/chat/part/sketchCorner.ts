import type { ModelNode, StudioDoc } from '../../engine/doc';
import { isRefusal } from '../../engine/refusal';
import { chamferCorner, roundStraightCornerForEdit } from '../../sketch/corner';
import { nextIdOf } from '../../sketch/entityIds';
import { profileOf } from '../../sketch/loops';
import { rebindDims, replaceSketchProfile, sketchShapes } from '../../sketch/reopen';
import { rectangleOutline } from '../../sketch/select';
import { isObj } from '../../util/guards';

function cornerSource(doc: StudioDoc, index: number) {
  const node = doc.nodes[index];
  if (node?.kind !== 'sketch' || !node.id || node.suppressed || node.on || node.association || node.pocketFloor
    || node.regions?.length || node.holes?.length || node.outline?.circles?.length || !node.sideTags
    || doc.nodes.some((other, at) => at !== index && other.id === node.id)) return null;
  try {
    const { shape, done } = sketchShapes(node, doc.parameters);
    const outline = shape?.kind === 'rectangle' ? rectangleOutline(shape) : shape;
    const tags = node.sideTags.outer;
    if (outline?.kind !== 'polygon' || !outline.closed || outline.construction || !outline.ids
      || tags.length !== outline.points.length || new Set(tags).size !== tags.length || tags.some(id => !id)) return null;
    return { node, outline, ids: outline.ids, nextId: nextIdOf([outline, ...done]) };
  } catch (error) {
    if (isRefusal(error, 'VALUE', 'PARAMETER_UNKNOWN')) return null;
    throw error;
  }
}

function straightCorners({ outline, ids }: NonNullable<ReturnType<typeof cornerSource>>) {
  return outline.points.flatMap((point, index) => {
    const previous = (index + ids.length - 1) % ids.length;
    if (outline.bulges?.[previous] || outline.bulges?.[index]) return [];
    return [{ index, point, sides: [ids[previous], ids[index]] }];
  });
}

export function sketchEditCorners(doc: StudioDoc, index: number) {
  const source = cornerSource(doc, index);
  return source && Number.isSafeInteger(source.nextId)
    ? straightCorners(source).map(({ point, sides }) => ({ point, sides }))
    : [];
}

export function editSketchCorner(doc: StudioDoc, index: number, kind: 'CHAMFER' | 'ROUND', input: unknown): { node: ModelNode } | { code: string; error: string } {
  const field = kind === 'ROUND' ? 'radius' : 'distance';
  const value = isObj(input) ? input[field] : undefined;
  const refuse = (reason: string, error: string) => ({ code: `EDIT_SKETCH_${kind}_${reason}`, error });
  if (!isObj(input) || typeof input.sketch !== 'string' || !Array.isArray(input.sides)
    || input.sides.length !== 2 || input.sides.some(id => typeof id !== 'string' || !id) || input.sides[0] === input.sides[1]
    || typeof value !== 'number' || !Number.isFinite(value))
    return { code: 'EDIT_INPUT', error: `Give the saved sketch ID, two distinct incident side IDs and a finite ${field} in mm.` };
  const source = cornerSource(doc, index);
  if (!source || source.node.id !== input.sketch || !Number.isSafeInteger(source.nextId))
    return refuse('SOURCE', 'Use the ID of one independent saved outline with stable side IDs.');
  const sides = input.sides;
  const corners = straightCorners(source).filter(corner => corner.sides.every(id => sides.includes(id)));
  if (corners.length !== 1)
    return refuse('CORNER', 'Use the two straight sides of one corner from query.edit_fields.');
  const at = corners[0].index;
  const result = kind === 'ROUND'
    ? roundStraightCornerForEdit(source.outline, at, value)
    : chamferCorner(source.outline, at, value);
  if ('error' in result) return refuse('GEOMETRY', result.error);
  const ids = [...source.ids];
  ids.splice(at, 0, `e${source.nextId}`);
  const profile = profileOf([{ ...result.shape, ids }]);
  if ('error' in profile) return refuse('GEOMETRY', profile.error);
  const tags = profile.node.sideTags?.outer;
  if (!tags || tags.length !== ids.length || ids.some(id => !tags.includes(id)))
    return refuse('GEOMETRY', 'The corner edit would change existing side IDs.');
  const rebound = rebindDims(source.node, profile.node, doc.parameters);
  if (rebound.dropped.length)
    return refuse('BINDING', 'The corner edit would remove a sketch parameter binding.');
  return { node: replaceSketchProfile(source.node, rebound.node) };
}

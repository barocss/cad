import type { ModelNode, StudioDoc } from '../../engine/doc';
import { isRefusal } from '../../engine/refusal';
import { chamferCorner } from '../../sketch/corner';
import { nextIdOf } from '../../sketch/entityIds';
import { profileOf } from '../../sketch/loops';
import { rebindDims, replaceSketchProfile, sketchShapes } from '../../sketch/reopen';
import { rectangleOutline } from '../../sketch/select';
import { isObj } from '../../util/guards';

function chamferSource(doc: StudioDoc, index: number) {
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

function straightCorners({ outline, ids }: NonNullable<ReturnType<typeof chamferSource>>) {
  return outline.points.flatMap((point, index) => {
    const previous = (index + ids.length - 1) % ids.length;
    if (outline.bulges?.[previous] || outline.bulges?.[index]) return [];
    return [{ index, point, sides: [ids[previous], ids[index]] }];
  });
}

export function sketchChamferCorners(doc: StudioDoc, index: number) {
  const source = chamferSource(doc, index);
  return source && Number.isSafeInteger(source.nextId)
    ? straightCorners(source).map(({ point, sides }) => ({ point, sides }))
    : [];
}

export function editSketchChamfer(doc: StudioDoc, index: number, input: unknown): { node: ModelNode } | { code: string; error: string } {
  const refuse = (code: string, error: string) => ({ code, error });
  if (!isObj(input) || typeof input.sketch !== 'string' || !Array.isArray(input.sides)
    || input.sides.length !== 2 || input.sides.some(id => typeof id !== 'string' || !id) || input.sides[0] === input.sides[1]
    || typeof input.distance !== 'number' || !Number.isFinite(input.distance))
    return refuse('EDIT_INPUT', 'Give the saved sketch ID, two distinct incident side IDs and a finite chamfer distance in mm.');
  const source = chamferSource(doc, index);
  if (!source || source.node.id !== input.sketch || !Number.isSafeInteger(source.nextId))
    return refuse('EDIT_SKETCH_CHAMFER_SOURCE', 'Use the ID of one independent saved outline with stable side IDs.');
  const sides = input.sides;
  const corners = straightCorners(source).filter(corner => corner.sides.every(id => sides.includes(id)));
  if (corners.length !== 1)
    return refuse('EDIT_SKETCH_CHAMFER_CORNER', 'Use the two straight sides of one corner from query.edit_fields.');
  const at = corners[0].index;
  const result = chamferCorner(source.outline, at, input.distance);
  if ('error' in result) return refuse('EDIT_SKETCH_CHAMFER_GEOMETRY', result.error);
  const ids = [...source.ids];
  ids.splice(at, 0, `e${source.nextId}`);
  const profile = profileOf([{ ...result.shape, ids }]);
  if ('error' in profile) return refuse('EDIT_SKETCH_CHAMFER_GEOMETRY', profile.error);
  const tags = profile.node.sideTags?.outer;
  if (!tags || tags.length !== ids.length || ids.some(id => !tags.includes(id)))
    return refuse('EDIT_SKETCH_CHAMFER_GEOMETRY', 'The bevel would change existing side IDs.');
  const rebound = rebindDims(source.node, profile.node, doc.parameters);
  if (rebound.dropped.length)
    return refuse('EDIT_SKETCH_CHAMFER_BINDING', 'The chamfer would remove a sketch parameter binding.');
  return { node: replaceSketchProfile(source.node, rebound.node) };
}

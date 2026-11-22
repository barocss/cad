import type { ModelNode, StudioDoc } from '../../engine/doc';
import { isRefusal } from '../../engine/refusal';
import { chamferCorner, roundStraightCornerForEdit } from '../../sketch/corner';
import { editChamferSetback, savedChamferSetback } from '../../sketch/chamferEdit';
import { prepareStraightCornerBatch } from '../../sketch/cornerBatch';
import { nextIdOf } from '../../sketch/entityIds';
import { editFilletRadius, savedFilletRadius } from '../../sketch/filletEdit';
import { profileOf } from '../../sketch/loops';
import { rebindDims, replaceSketchProfile, sketchShapes } from '../../sketch/reopen';
import { rectangleOutline } from '../../sketch/select';
import type { Polygon } from '../../sketch/rules';
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

export function sketchEditChamfers(doc: StudioDoc, index: number) {
  const source = cornerSource(doc, index);
  return source && hasSavedTags(source)
    ? source.ids.flatMap((bevel, at) => {
      const distance = savedChamferSetback(source.outline, at);
      return distance === undefined ? [] : [{ bevel, distance }];
    })
    : [];
}

export function sketchEditFillets(doc: StudioDoc, index: number) {
  const source = cornerSource(doc, index);
  return source && hasSavedTags(source)
    ? source.ids.flatMap((fillet, at) => {
      const radius = savedFilletRadius(source.outline, at);
      return radius === undefined ? [] : [{ fillet, radius }];
    })
    : [];
}

function hasSavedTags(source: NonNullable<ReturnType<typeof cornerSource>>) {
  const tags = source.node.sideTags!.outer;
  return source.ids.length === tags.length && source.ids.every((id, at) => id === tags[at]);
}

function sidePair(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === 'string' && value[0].length > 0
    && typeof value[1] === 'string' && value[1].length > 0 && value[0] !== value[1];
}

function requestedPairs(input: Record<string, unknown>, field: 'radius' | 'distance'): [string, string][] | null {
  const single = Object.hasOwn(input, 'sides'), batch = Object.hasOwn(input, 'corners');
  if (single === batch) return null;
  const key = single ? 'sides' : 'corners';
  if (Object.keys(input).some(name => name !== 'sketch' && name !== field && name !== key)) return null;
  if (single) return sidePair(input.sides) ? [input.sides] : null;
  if (!Array.isArray(input.corners) || input.corners.length < 2) return null;
  const pairs: unknown[] = Array.from(input.corners);
  return pairs.every(sidePair) ? pairs : null;
}

export function editSketchCorner(doc: StudioDoc, index: number, kind: 'CHAMFER' | 'ROUND', input: unknown): { node: ModelNode } | { code: string; error: string } {
  const round = kind === 'ROUND';
  const field = round ? 'radius' : 'distance';
  const selector = round ? 'fillet' : 'bevel';
  const value = isObj(input) ? input[field] : undefined;
  const refuse = (reason: string, error: string) => ({ code: `EDIT_SKETCH_${kind}_${reason}`, error });
  const saved = isObj(input) && Object.hasOwn(input, selector);
  const pairs = isObj(input) ? requestedPairs(input, field) : null;
  const validSaved = saved && typeof input[selector] === 'string' && input[selector].length > 0
    && Object.keys(input).every(key => key === 'sketch' || key === selector || key === field);
  if (!isObj(input) || typeof input.sketch !== 'string' || (saved ? !validSaved : !pairs) || typeof value !== 'number' || !Number.isFinite(value))
    return { code: 'EDIT_INPUT', error: saved
      ? `Give the saved sketch ID, one ${selector} ID and a finite ${field} in mm. Use ${selector} alone; do not mix it with sides or corners.`
      : `Give the saved sketch ID and a finite ${field} in mm. Use sides for one side pair or corners for at least two side pairs.` };
  const source = cornerSource(doc, index);
  if (!source || source.node.id !== input.sketch || (saved ? !hasSavedTags(source) : !Number.isSafeInteger(source.nextId)))
    return refuse('SOURCE', 'Use the ID of one independent saved outline with stable side IDs.');
  const available = straightCorners(source), targets = new Set<number>();
  for (const pair of pairs ?? []) {
    const corner = available.find(item => item.sides.every(id => pair.includes(id)));
    if (!corner) return refuse('CORNER', 'Use the two straight sides of one corner from query.edit_fields.');
    if (targets.has(corner.index)) return refuse('CORNER', 'List each selected corner once.');
    targets.add(corner.index);
  }

  let shape: Polygon;
  if (saved) {
    const at = source.ids.indexOf(input[selector] as string);
    const current = round ? savedFilletRadius(source.outline, at) : savedChamferSetback(source.outline, at);
    if (current === undefined)
      return refuse(round ? 'FILLET' : 'BEVEL', `Use a saved ${selector} ID from query.edit_fields.`);
    const result = round ? editFilletRadius(source.outline, at, value) : editChamferSetback(source.outline, at, value);
    if ('error' in result) return refuse('GEOMETRY', result.error);
    if (result.shape === source.outline) return { node: source.node };
    shape = result.shape;
  } else if (targets.size > 1) {
    const result = prepareStraightCornerBatch(source.outline, kind === 'ROUND' ? 'fillet' : 'chamfer', [...targets], value, source.nextId);
    if ('error' in result) return refuse('GEOMETRY', result.error);
    shape = result.display;
  } else {
    const [at] = targets;
    const result = kind === 'ROUND'
      ? roundStraightCornerForEdit(source.outline, at, value)
      : chamferCorner(source.outline, at, value);
    if ('error' in result) return refuse('GEOMETRY', result.error);
    const ids = [...source.ids];
    ids.splice(at, 0, `e${source.nextId}`);
    shape = { ...result.shape, ids };
  }
  const profile = profileOf([shape]);
  if ('error' in profile) return refuse('GEOMETRY', profile.error);
  const tags = profile.node.sideTags?.outer;
  if (!shape.ids || !tags || tags.length !== shape.ids.length || shape.ids.some(id => !tags.includes(id)))
    return refuse('GEOMETRY', 'The corner edit would change existing side IDs.');
  const savedTags = source.node.sideTags!.outer;
  if (saved && (tags.length !== savedTags.length || tags.some((id, at) => id !== savedTags[at])))
    return refuse('GEOMETRY', `The ${round ? 'Fillet' : 'Chamfer'} edit would change the saved side IDs or their order.`);
  const rebound = rebindDims(source.node, profile.node, doc.parameters);
  if (rebound.dropped.length)
    return refuse('BINDING', 'The corner edit would remove a sketch parameter binding.');
  return { node: replaceSketchProfile(source.node, rebound.node) };
}

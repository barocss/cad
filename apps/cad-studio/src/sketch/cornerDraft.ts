import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { chamferCorner, roundCorner } from '@barocss/cad-model/sketch/corner';
import { nextIdOf, withIds } from '@barocss/cad-model/sketch/entityIds';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { rebindDims } from '@barocss/cad-model/sketch/reopen';
import { isSettled, type Polygon } from '@barocss/cad-model/sketch/rules';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { sketchFinishInputs } from '../app/sketchControls';

export type SketchCornerOperation = 'fillet' | 'chamfer';
export type SketchCornerResult = { shape: Polygon; display: Polygon } | { error: string };

function tagCornerSegment(owner: SketchState, shape: Polygon, corner: number, operation: string): Polygon | string {
  const id = nextIdOf([shape, ...(owner.done ?? [])]);
  const noIds = `This sketch has no available side IDs for the ${operation} and its other shapes.`;
  if (!Number.isSafeInteger(id)) return noIds;
  const tagged = shape.ids ? { ...shape, ids: shape.ids.map((side, i) => i === corner ? `e${id}` : side) } : shape;
  const { joined, protectedShapes } = sketchFinishInputs({ ...owner, shape: tagged });
  const unsafeId = (id: string) => /^e\d+$/.test(id) && !Number.isSafeInteger(Number(id.slice(1)));
  return withIds(joined, undefined, protectedShapes).some(item =>
    item.ids?.some(unsafeId) || (item.kind === 'polygon' && item.circleIds?.some(unsafeId))) ? noIds : tagged;
}

export function prepareSketchCorner(owner: SketchState, source: Polygon, doc: StudioDoc,
  operation: SketchCornerOperation, corner: number, input: string): SketchCornerResult {
  const stored = owner.editNode === undefined ? undefined : doc.nodes[owner.editNode];
  const value = input.trim() === '' ? NaN : Number(input);
  let shape: Polygon | string;
  if (operation === 'fillet') {
    const previous = (corner - 1 + source.points.length) % source.points.length;
    const meetsArc = source.bulges?.[previous] || source.bulges?.[corner];
    if (meetsArc && (owner.association || owner.base || (stored?.kind === 'sketch' && stored.on)
      || owner.done?.some(item => !item.construction)))
      return { error: 'Round a line and arc on one independent outline.' };
    if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a positive radius.' };
    const result = roundCorner(source, corner, value);
    if ('error' in result) return result;
    shape = meetsArc && result.shape.ids ? tagCornerSegment(owner, result.shape, corner, 'round') : result.shape;
  } else {
    if (owner.association || owner.base || owner.band || (stored?.kind === 'sketch' && (stored.on || stored.profile === 'band')) ||
      owner.done?.some(item => !item.construction && item.kind !== 'bezier') || source.construction)
      return { error: 'Chamfer one independent material outline.' };
    const result = chamferCorner(source, corner, value);
    if ('error' in result) return result;
    shape = tagCornerSegment(owner, result.shape, corner, 'chamfer');
    if (typeof shape === 'string') return { error: shape };
    const profile = profileOf(sketchFinishInputs({ ...owner, shape }).joined);
    if ('error' in profile) return profile;
    if (stored?.kind === 'sketch' && rebindDims(stored, profile.node, doc.parameters).dropped.length)
      return { error: 'Chamfer would remove a sketch parameter binding.' };
  }
  if (typeof shape === 'string') return { error: shape };
  const settled = settleShape(shape, source);
  if (settled.error || !isSettled(settled.shape)) return { error: settled.error ?? 'The corner preview could not be settled.' };
  return { shape, display: settled.shape };
}

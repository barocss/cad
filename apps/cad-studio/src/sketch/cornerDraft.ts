import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { canChamferWithTwoSetbacks, chamferCorner, roundCorner } from '@barocss/cad-model/sketch/corner';
import { editChamferSetbacks, editTwoDistanceChamfer, savedChamferSetback, savedTwoDistanceChamfer } from '@barocss/cad-model/sketch/chamferEdit';
import { prepareStraightCornerBatch } from '@barocss/cad-model/sketch/cornerBatch';
import { nextIdOf, withIds } from '@barocss/cad-model/sketch/entityIds';
import { editFilletRadii, savedFilletRadius } from '@barocss/cad-model/sketch/filletEdit';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { rebindDims } from '@barocss/cad-model/sketch/reopen';
import { isSettled, type Polygon, type SketchPick } from '@barocss/cad-model/sketch/rules';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { sketchFinishInputs } from '../app/sketchControls';

export type SketchCornerOperation = 'fillet' | 'chamfer';
type SketchCornerResize = 'resize-fillet' | 'resize-chamfer';
export type SketchCornerAction = SketchCornerOperation | SketchCornerResize;
export type SketchCornerResult = { shape: Polygon; display: Polygon } | { error: string };
export type SavedSketchCorners = { edges: readonly [number, ...number[]]; operation: SketchCornerResize; value: number | null; outgoing?: number };

function independentCornerOutline(owner: SketchState, source: Polygon, doc: StudioDoc): boolean {
  const stored = owner.editNode === undefined ? undefined : doc.nodes[owner.editNode];
  return !owner.association && !owner.base && !owner.band && !owner.anchor?.face?.linkSource &&
    !(stored?.kind === 'sketch' && (stored.on || stored.profile === 'band')) &&
    !owner.done?.some(item => !item.construction && item.kind !== 'bezier') && !source.construction;
}

export function selectedSavedCorners(owner: SketchState, source: Polygon, doc: StudioDoc,
  picked: readonly SketchPick[]): SavedSketchCorners | undefined {
  const [first, ...others] = picked;
  if (owner.tool !== 'select' || !first || picked.some(pick => pick.kind !== 'edge' || pick.done) ||
    !independentCornerOutline(owner, source, doc)) return;
  const edges = [first.i, ...others.map(pick => pick.i)] as const;
  const fillet = !!source.bulges?.[first.i];
  if (!fillet && !others.length) {
    const pair = savedTwoDistanceChamfer(source, first.i);
    if (pair) return { edges, value: pair.incoming, outgoing: pair.outgoing, operation: 'resize-chamfer' };
  }
  const sizeOf = fillet ? savedFilletRadius : savedChamferSetback;
  const sizes = edges.map(edge => sizeOf(source, edge));
  const [firstSize] = sizes;
  if (firstSize === undefined || sizes.includes(undefined)) return;
  return { edges, value: sizes.every(size => size === firstSize) ? firstSize : null,
    operation: fillet ? 'resize-fillet' : 'resize-chamfer' };
}

export function prepareSavedSketchCorners(owner: SketchState, source: Polygon, doc: StudioDoc,
  resize: SavedSketchCorners, input: string, outgoing?: string): SketchCornerResult {
  const fillet = resize.operation === 'resize-fillet';
  const name = fillet ? 'fillet' : 'chamfer';
  if (!independentCornerOutline(owner, source, doc)) return { error: `Edit the selected ${name} on an independent outline.` };
  if (resize.value === null && input.trim() === '') return { shape: source, display: source };
  const value = input.trim() === '' ? NaN : Number(input);
  const editSizes = fillet ? editFilletRadii : editChamferSetbacks;
  if (outgoing !== undefined && (fillet || resize.edges.length !== 1 || resize.outgoing === undefined))
    return { error: 'Select one saved two-distance Chamfer.' };
  const edited = outgoing === undefined ? editSizes(source, resize.edges, value)
    : editTwoDistanceChamfer(source, resize.edges[0], value, outgoing.trim() === '' ? NaN : Number(outgoing));
  if ('error' in edited) return edited;
  const { shape } = edited;
  if (shape === source) return { shape, display: shape };
  const { joined, hasUnsafeId } = cornerFinishInputs(owner, shape);
  if (hasUnsafeId) return { error: 'This sketch has no available side IDs for its other shapes.' };
  const profile = profileOf(joined);
  if ('error' in profile) return profile;
  const stored = owner.editNode === undefined ? undefined : doc.nodes[owner.editNode];
  if (stored?.kind === 'sketch' && rebindDims(stored, profile.node, doc.parameters).dropped.length)
    return { error: `Editing this ${name} would remove a sketch parameter binding.` };
  return { shape, display: shape };
}

/** A line pair names its shared vertex. A single selected line does not name either end. */
export function sketchCornerTargets(source: Polygon, picked: readonly SketchPick[]): number[] {
  const n = source.points.length;
  if (picked.some(pick => pick.kind === 'circle' || pick.done || pick.i < 0 || pick.i >= n
    || !Number.isInteger(pick.i) || (pick.kind === 'edge' && source.bulges?.[pick.i]))) return [];
  const points = new Set(picked.filter(pick => pick.kind === 'point').map(pick => pick.i));
  const edges = new Set(picked.filter(pick => pick.kind === 'edge').map(pick => pick.i));
  return source.points.flatMap((_, i) => points.has(i) || (edges.has(i) && edges.has((i - 1 + n) % n)) ? [i] : []);
}

const unsafeSideId = (id: string) => /^e\d+$/.test(id) && !Number.isSafeInteger(Number(id.slice(1)));

function cornerFinishInputs(owner: SketchState, shape: Polygon) {
  const { joined, protectedShapes } = sketchFinishInputs({ ...owner, shape });
  const hasUnsafeId = withIds(joined, undefined, protectedShapes).some(item =>
    item.ids?.some(unsafeSideId) || (item.kind === 'polygon' && item.circleIds?.some(unsafeSideId)));
  return { joined, hasUnsafeId };
}

function tagCornerSegment(owner: SketchState, shape: Polygon, corner: number, operation: string): Polygon | string {
  const id = nextIdOf([shape, ...(owner.done ?? [])]);
  const noIds = `This sketch has no available side IDs for the ${operation} and its other shapes.`;
  if (!Number.isSafeInteger(id)) return noIds;
  const tagged = shape.ids ? { ...shape, ids: shape.ids.map((side, i) => i === corner ? `e${id}` : side) } : shape;
  return cornerFinishInputs(owner, tagged).hasUnsafeId ? noIds : tagged;
}

export function prepareSketchCorners(owner: SketchState, source: Polygon, doc: StudioDoc,
  operation: SketchCornerOperation, corners: readonly number[], input: string, outgoing?: string): SketchCornerResult {
  if (corners.length === 1) return prepareSketchCorner(owner, source, doc, operation, corners[0], input, outgoing);
  if (outgoing !== undefined && (operation !== 'chamfer' || !allowsTwoSetbackChamfer(owner, source, doc, corners)))
    return { error: 'Select two perpendicular corners on one independent outline.' };
  const stored = owner.editNode === undefined ? undefined : doc.nodes[owner.editNode];
  if (owner.association || owner.base || owner.band || source.circles?.length || source.construction
    || (stored?.kind === 'sketch' && (stored.on || stored.profile === 'band'))
    || owner.done?.some(item => !item.construction && item.kind !== 'bezier'))
    return { error: 'Edit several corners on one independent outline.' };
  const value = input.trim() === '' ? NaN : Number(input);
  const second = outgoing === undefined ? undefined : outgoing.trim() === '' ? NaN : Number(outgoing);
  const result = prepareStraightCornerBatch(source, operation, corners, value, nextIdOf([source, ...(owner.done ?? [])]), second);
  if ('error' in result) return result;
  const { joined, hasUnsafeId } = cornerFinishInputs(owner, result.display);
  if (hasUnsafeId) return { error: 'This sketch has no available side IDs for the corner edits and its other shapes.' };
  const profile = profileOf(joined);
  if ('error' in profile) return profile;
  if (stored?.kind === 'sketch' && rebindDims(stored, profile.node, doc.parameters).dropped.length)
    return { error: 'The corner edits would remove a sketch parameter binding.' };
  return result;
}

export function allowsTwoSetbackChamfer(owner: SketchState, source: Polygon, doc: StudioDoc, corners: readonly number[]): boolean {
  return (corners.length === 1 || corners.length === 2 && !source.circles?.length)
    && independentCornerOutline(owner, source, doc) && corners.every(corner => canChamferWithTwoSetbacks(source, corner));
}

export function prepareSketchCorner(owner: SketchState, source: Polygon, doc: StudioDoc,
  operation: SketchCornerOperation, corner: number, input: string, outgoing?: string): SketchCornerResult {
  if (outgoing !== undefined && (operation !== 'chamfer' || !allowsTwoSetbackChamfer(owner, source, doc, [corner])))
    return { error: 'Select one perpendicular corner on an independent outline.' };
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
    const next = outgoing === undefined ? undefined : outgoing.trim() === '' ? NaN : Number(outgoing);
    const result = chamferCorner(source, corner, value, next);
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

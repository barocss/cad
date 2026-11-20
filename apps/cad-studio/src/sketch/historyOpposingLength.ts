import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { isDefaultPlane } from '@barocss/cad-model/sketch/plane';
import { sketchShapes } from '@barocss/cad-model/sketch/reopen';
import { opposingLengthConflict } from './constraintList';

type PolygonNode = Extract<ModelNode, { kind: 'sketch'; profile: 'polygon' }>;
type HistoryLength = { kind: 'same' } | { kind: 'conflict'; opposite: number; locked: number };

function plainSource(node: ModelNode | undefined): node is PolygonNode {
  if (node?.kind !== 'sketch' || node.profile !== 'polygon' || node.on || node.association || node.pocketFloor
    || node.regions?.length || node.regionLengths?.length || node.holes?.length || node.holeOutlines?.length
    || node.construction?.length || (node.plane && !isDefaultPlane(node.plane))) return false;
  const outline = node.outline, tags = node.sideTags?.outer;
  return !!outline && node.points.length === 4 && outline.points.length === 4 && !!tags && tags.length === 4
    && tags.every(tag => typeof tag === 'string' && !!tag) && new Set(tags).size === 4
    && !outline.bulges?.some(Boolean) && !outline.circles?.length && !outline.rules?.length
    && !outline.tangents?.length && !outline.equalRadii?.length && !outline.concentric?.length
    && !Object.keys(outline.radii ?? {}).length && !outline.spline && !outline.ellipse
    && node.points.every((point, i) => point.length === 2 && outline.points[i].length === 2
      && point.every((coordinate, axis) => typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate === outline.points[i][axis]));
}

export function inspectHistoryOpposingLength(original: ModelNode[], draft: ModelNode[], index: number,
  field: string, value: number): HistoryLength | undefined {
  const match = /^olen([0-3])$/.exec(field);
  if (!match || !Number.isFinite(value) || value < 0.001) return;
  const edge = Number(match[1]);
  const before = original[index], after = draft[index];
  // Admit only the original ordinary Extrude. Changing other fields within its own editor
  // (e.g. Draft or Start Z) cannot resolve or hide a conflict in the unchanged authored sketch.
  if (before?.kind !== 'extrude' || after?.kind !== 'extrude' || before.id !== after.id || before.sketch !== after.sketch
    || before.made || before.suppressed || before.draft || before.cutDepth) return;
  const saved = original[before.sketch], current = draft[after.sketch];
  if (!plainSource(saved) || !plainSource(current) || saved.id !== current.id
    || saved.sideTags!.outer.some((tag, i) => current.sideTags!.outer[i] !== tag)) return;
  // Use the same authored owner as the existing History setter, and never infer a row from solved geometry.
  let reopened: ReturnType<typeof sketchShapes>;
  try { reopened = sketchShapes(current); } catch { return; }
  const { shape, done } = reopened;
  if (done.length || shape?.kind !== 'polygon' || !shape.closed || shape.pending || !shape.lengths
    || shape.ids?.length !== 4 || shape.ids.some((tag, i) => current.sideTags!.outer[i] !== tag)
    || !Object.hasOwn(shape.lengths, edge) || !Number.isFinite(shape.lengths[edge])) return;
  const hv = shape.hv;
  if (!hv || !(hv.h.length === 2 && hv.v.length === 2
    && ((hv.h.includes(0) && hv.h.includes(2) && hv.v.includes(1) && hv.v.includes(3))
      || (hv.v.includes(0) && hv.v.includes(2) && hv.h.includes(1) && hv.h.includes(3))))) return;
  const opposite = (edge + 2) % 4;
  const locked = shape.lengths[opposite];
  if (!Object.hasOwn(shape.lengths, opposite) || typeof locked !== 'number' || !Number.isFinite(locked) || locked < 0.001) return;
  if (value === shape.lengths[edge]) return { kind: 'same' };
  if (opposingLengthConflict(shape, 'len' + edge, value) !== opposite) return;
  return { kind: 'conflict', opposite, locked };
}
